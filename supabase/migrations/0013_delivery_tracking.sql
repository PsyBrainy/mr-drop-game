-- =============================================================================
-- Mister Drop · reparto (2 de 2): repartidores, estados y seguimiento
--
-- Requiere 0012 corrida ANTES y por separado (los valores nuevos de los enums).
--
-- Despues de que el admin cierra la camada, cada pedido hace este recorrido:
--
--   pending ──(el repartidor lo toma / el admin lo asigna)──> assigned
--   assigned ──(sale)──> on_the_way ──> delivered
--                                  └──> failed   (no atendio, direccion mal)
--   assigned ──(lo suelta)──> pending            (vuelve a la bolsa)
--
-- El admin puede corregir cualquier estado (ya lo hacia desde el panel con
-- update directo, y eso sigue igual). El repartidor NO tiene policy de update:
-- todo lo que hace pasa por las funciones de abajo, que validan la transicion.
-- La app manda la intencion; la base decide.
--
-- Quien escribe que:
--   usuario     place_order / cancel_my_order (0008), mientras la camada esta abierta
--   repartidor  start_shift / end_shift / report_position / claim_order /
--               courier_update_order, con la camada cerrada
--   admin       assign_order, y update directo de orders.status (correcciones)
--   triggers    status_changed_at, delivered_at, courier_id al volver a la bolsa,
--               el registro en order_events (nadie mas lo escribe) y el aviso
--               NOTIFY delivery.
--
-- Tiempo real: NO se usa Supabase Realtime. Cada cambio de pedido o de camada
-- hace `pg_notify('delivery', <json>)`, que es Postgres estandar. psy-ws
-- escucha con LISTEN y le avisa por su WebSocket a quien corresponda (admin,
-- el repartidor del pedido, la bolsa). NOTIFY sale recien al hacer commit: un
-- cambio que se deshace no avisa nada. El formato del aviso lo lee
-- psy-ws/.../delivery/adapter/out/postgres/NotificationPayload.kt.
--
-- El contrato de transiciones del repartidor esta en
-- src/domain/order/orderFlow.contract.json, commiteado tambien en la app
-- Android. courierFlow.test.ts lee ESTE archivo y compara la lista de
-- courier_transition_allowed() contra el contrato: si se cambia de un lado
-- sin el otro, rompe el test.
-- =============================================================================

-- Helper de autorizacion, gemelo de is_admin().
create or replace function public.is_courier()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'courier'
  );
$$;

-- -----------------------------------------------------------------------------
-- orders: quien lo lleva y desde cuando esta en el estado actual
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists courier_id        uuid references public.profiles (id) on delete set null,
  add column if not exists status_changed_at timestamptz not null default now();

comment on column public.orders.courier_id is
  'Repartidor que lo lleva. Obligatorio en assigned y on_the_way; se limpia al volver a pending o cancelarse.';
comment on column public.orders.status_changed_at is
  'Cuando entro al estado actual (lo pone el trigger). Sirve para "hace 20 minutos que esta en camino".';

-- Un pedido "en manos de alguien" sin ese alguien es un pedido que nadie va a
-- entregar y que no aparece en la lista de ningun repartidor.
alter table public.orders drop constraint if exists orders_courier_required;
alter table public.orders add constraint orders_courier_required
  check (status not in ('assigned', 'on_the_way') or courier_id is not null);

create index if not exists orders_courier_idx
  on public.orders (courier_id, status)
  where courier_id is not null;

-- -----------------------------------------------------------------------------
-- El contrato del repartidor. Unica fuente en SQL de "que puede mover a que".
-- courierFlow.test.ts lee lo que hay entre los marcadores: mantener una
-- transicion por linea, como ('desde', 'hasta').
-- -----------------------------------------------------------------------------
create or replace function public.courier_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
as $$
  select (p_from::text, p_to::text) in (values
    -- contrato:inicio
    ('pending', 'assigned'),
    ('assigned', 'on_the_way'),
    ('assigned', 'pending'),
    ('on_the_way', 'delivered'),
    ('on_the_way', 'failed')
    -- contrato:fin
  );
$$;

-- -----------------------------------------------------------------------------
-- order_events: la historia de cada pedido
--
-- La escribe SOLO el trigger, venga el cambio de donde venga (RPC del
-- repartidor, update directo del admin, place_order). Asi el historial no
-- depende de que cada camino se acuerde de anotar. La posicion es la ultima
-- que reporto el repartidor que hizo el cambio, si es reciente: es "donde
-- estaba cuando marco entregado", no un tracking.
-- -----------------------------------------------------------------------------
create table if not exists public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  from_status public.order_status,
  to_status   public.order_status not null,
  courier_id  uuid references public.profiles (id) on delete set null,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

comment on table public.order_events is
  'Historial de estados de cada pedido. Lo escribe el trigger; actor null = SQL Editor / sistema.';

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;

-- El cliente no ve el historial: trae la posicion del repartidor.
drop policy if exists "admin y repartidor ven historial" on public.order_events;
create policy "admin y repartidor ven historial"
  on public.order_events for select
  using (public.is_admin() or courier_id = auth.uid());

grant select on public.order_events to authenticated;

-- -----------------------------------------------------------------------------
-- courier_presence: turno y ultima posicion, una fila por repartidor
--
-- Solo la ultima posicion, no el recorrido: para ver en el mapa donde esta
-- cada uno alcanza, y no se acumula un historial de por donde anduvo cada
-- persona. Fuera de turno no hay posicion (lo impone el check, no la app).
-- -----------------------------------------------------------------------------
create table if not exists public.courier_presence (
  courier_id       uuid primary key references public.profiles (id) on delete cascade,
  on_shift         boolean not null default false,
  shift_started_at timestamptz,
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  accuracy_m       real check (accuracy_m >= 0),
  heading_deg      real check (heading_deg >= 0 and heading_deg < 360),
  speed_mps        real check (speed_mps >= 0),
  -- Hora del celular al tomar la posicion; updated_at es la del servidor.
  recorded_at      timestamptz,
  updated_at       timestamptz not null default now(),
  constraint courier_presence_point check ((lat is null) = (lng is null)),
  constraint courier_presence_only_on_shift check (on_shift or lat is null)
);

comment on table public.courier_presence is
  'Turno y ultima posicion de cada repartidor. Se escribe solo por RPC. Fuera de turno lat/lng es null.';

alter table public.courier_presence enable row level security;

drop policy if exists "admin y el repartidor ven la presencia" on public.courier_presence;
create policy "admin y el repartidor ven la presencia"
  on public.courier_presence for select
  using (public.is_admin() or courier_id = auth.uid());

grant select on public.courier_presence to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers de orders
-- -----------------------------------------------------------------------------

-- Antes: normaliza lo que se deriva del estado, para que ningun camino (ni el
-- update directo del admin) lo deje inconsistente.
create or replace function public.orders_normalize_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;

  -- Volver a la bolsa o cancelarse suelta al repartidor: si no, el pedido
  -- seguiria en su lista.
  if new.status in ('pending', 'cancelled') then
    new.courier_id := null;
  end if;

  new.delivered_at := case
    when new.status = 'delivered' then coalesce(new.delivered_at, now())
    else null
  end;

  return new;
end;
$$;

drop trigger if exists orders_normalize_status on public.orders;
create trigger orders_normalize_status
  before update on public.orders
  for each row execute function public.orders_normalize_status();

-- Despues: anota el cambio. SECURITY DEFINER porque order_events no tiene
-- policy de insert para nadie.
create or replace function public.orders_log_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.courier_id is not distinct from old.courier_id then
    return null;
  end if;

  select p.lat, p.lng into v_lat, v_lng
  from public.courier_presence p
  where p.courier_id = auth.uid()
    and p.on_shift
    and p.updated_at > now() - interval '2 minutes';

  insert into public.order_events (order_id, actor_id, from_status, to_status, courier_id, lat, lng)
  values (
    new.id,
    auth.uid(),
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    coalesce(new.courier_id, case when tg_op = 'UPDATE' then old.courier_id end),
    v_lat,
    v_lng
  );

  -- El aviso lleva ids y estados, nunca la direccion ni el nombre: un NOTIFY
  -- lo puede escuchar cualquier conexion a la base. El que quiere el detalle
  -- lo pide, y ahi lo filtra RLS. roundClosed dice si el cambio toca la bolsa
  -- (con la camada abierta no hay nada para repartir).
  perform pg_notify('delivery', json_build_object(
    'kind',              'order',
    'orderId',           new.id,
    'roundId',           new.round_id,
    'status',            new.status,
    'fromStatus',        case when tg_op = 'UPDATE' then old.status end,
    'courierId',         new.courier_id,
    'previousCourierId', case when tg_op = 'UPDATE' then old.courier_id end,
    'roundClosed',       exists (select 1 from public.order_rounds r
                                 where r.id = new.round_id and r.status = 'closed')
  )::text);

  return null;
end;
$$;

-- Cerrar la camada llena la bolsa de golpe: los repartidores tienen que
-- enterarse aunque ningun pedido haya cambiado.
create or replace function public.order_rounds_notify()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    perform pg_notify('delivery', json_build_object(
      'kind',    'round',
      'roundId', new.id,
      'status',  new.status
    )::text);
  end if;
  return null;
end;
$$;

drop trigger if exists order_rounds_notify on public.order_rounds;
create trigger order_rounds_notify
  after update on public.order_rounds
  for each row execute function public.order_rounds_notify();

drop trigger if exists orders_log_event on public.orders;
create trigger orders_log_event
  after insert or update on public.orders
  for each row execute function public.orders_log_event();

-- -----------------------------------------------------------------------------
-- Lo que ve el repartidor
--
-- Sus pedidos, y "la bolsa": los pendientes sin dueño de camadas cerradas.
-- Mientras la camada esta abierta el usuario todavia puede rearmar o cancelar,
-- asi que no hay nada para repartir.
-- -----------------------------------------------------------------------------
drop policy if exists "repartidor ve sus pedidos y la bolsa" on public.orders;
create policy "repartidor ve sus pedidos y la bolsa"
  on public.orders for select
  using (
    public.is_courier() and (
      courier_id = auth.uid()
      or (
        status = 'pending'
        and courier_id is null
        and exists (select 1 from public.order_rounds r where r.id = round_id and r.status = 'closed')
      )
    )
  );

-- La subconsulta sobre orders pasa por el RLS de orders: el repartidor ve los
-- items exactamente de los pedidos que ve, sin repetir la condicion.
drop policy if exists "repartidor ve items" on public.order_items;
create policy "repartidor ve items"
  on public.order_items for select
  using (public.is_courier() and exists (select 1 from public.orders o where o.id = order_id));

-- -----------------------------------------------------------------------------
-- RPC (repartidor): turno
-- -----------------------------------------------------------------------------
create or replace function public.start_shift()
returns public.courier_presence
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.courier_presence%rowtype;
begin
  if not public.is_courier() then
    raise exception 'COURIER_REQUIRED' using errcode = 'P0020';
  end if;

  insert into public.courier_presence (courier_id, on_shift, shift_started_at, updated_at)
  values (auth.uid(), true, now(), now())
  on conflict (courier_id) do update
    set on_shift         = true,
        -- Volver a prender el turno sin haberlo cortado no lo reinicia.
        shift_started_at = case when courier_presence.on_shift
                                then courier_presence.shift_started_at else now() end,
        updated_at       = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Cortar el turno borra la posicion: fuera de turno la persona no se sigue.
create or replace function public.end_shift()
returns public.courier_presence
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.courier_presence%rowtype;
begin
  if not public.is_courier() then
    raise exception 'COURIER_REQUIRED' using errcode = 'P0020';
  end if;

  insert into public.courier_presence (courier_id, on_shift)
  values (auth.uid(), false)
  on conflict (courier_id) do update
    set on_shift = false, shift_started_at = null,
        lat = null, lng = null, accuracy_m = null, heading_deg = null, speed_mps = null,
        recorded_at = null, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC (repartidor): posicion
--
-- La app puede mandar tarde (sin señal, cola offline): una posicion mas vieja
-- que la guardada se ignora, para que el marcador no salte para atras. La hora
-- del celular no se cree si viene del futuro.
-- -----------------------------------------------------------------------------
create or replace function public.report_position(
  p_lat         double precision,
  p_lng         double precision,
  p_accuracy_m  real default null,
  p_heading_deg real default null,
  p_speed_mps   real default null,
  p_recorded_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz := least(coalesce(p_recorded_at, now()), now());
begin
  if not public.is_courier() then
    raise exception 'COURIER_REQUIRED' using errcode = 'P0020';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'POSITION_INVALID' using errcode = 'P0027';
  end if;

  update public.courier_presence
  set lat         = p_lat,
      lng         = p_lng,
      accuracy_m  = greatest(p_accuracy_m, 0),
      -- El heading de Android viene en [0, 360]; 360 es 0.
      heading_deg = case when p_heading_deg is null then null
                         else mod(mod(p_heading_deg::numeric, 360) + 360, 360)::real end,
      speed_mps   = greatest(p_speed_mps, 0),
      recorded_at = v_at,
      updated_at  = now()
  where courier_id = auth.uid()
    and on_shift
    and (recorded_at is null or recorded_at <= v_at);

  if not found and not exists (
    select 1 from public.courier_presence where courier_id = auth.uid() and on_shift
  ) then
    raise exception 'NOT_ON_SHIFT' using errcode = 'P0021';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC (repartidor): tomar un pedido de la bolsa
--
-- El "for update" es lo que evita que dos repartidores tomen el mismo: el
-- segundo espera al primero, y al seguir ya lo ve assigned.
-- -----------------------------------------------------------------------------
create or replace function public.claim_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_courier() then
    raise exception 'COURIER_REQUIRED' using errcode = 'P0020';
  end if;
  if not exists (select 1 from public.courier_presence where courier_id = auth.uid() and on_shift) then
    raise exception 'NOT_ON_SHIFT' using errcode = 'P0021';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0022';
  end if;

  if exists (select 1 from public.order_rounds r where r.id = v_order.round_id and r.status = 'open') then
    raise exception 'ROUND_STILL_OPEN' using errcode = 'P0023';
  end if;
  if v_order.courier_id is not null and v_order.courier_id <> auth.uid() then
    raise exception 'ORDER_TAKEN' using errcode = 'P0024';
  end if;
  if not public.courier_transition_allowed(v_order.status, 'assigned') then
    raise exception 'TRANSITION_INVALID' using errcode = 'P0025';
  end if;

  update public.orders
  set status = 'assigned', courier_id = auth.uid(), updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC (repartidor): mover uno de SUS pedidos
--
-- Un pedido ajeno responde ORDER_NOT_FOUND, no "no es tuyo": no le confirma a
-- nadie que ese id existe. Tomar de la bolsa va por claim_order.
-- -----------------------------------------------------------------------------
create or replace function public.courier_update_order(p_order_id uuid, p_status public.order_status)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_courier() then
    raise exception 'COURIER_REQUIRED' using errcode = 'P0020';
  end if;
  if not exists (select 1 from public.courier_presence where courier_id = auth.uid() and on_shift) then
    raise exception 'NOT_ON_SHIFT' using errcode = 'P0021';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.courier_id is distinct from auth.uid() then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0022';
  end if;

  if p_status = 'assigned' or not public.courier_transition_allowed(v_order.status, p_status) then
    raise exception 'TRANSITION_INVALID' using errcode = 'P0025';
  end if;

  update public.orders
  set status = p_status, updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC (admin): asignar, reasignar o devolver a la bolsa (p_courier_id null)
--
-- Solo sobre pedidos que todavia no salieron: sacarle a alguien un pedido que
-- ya esta en camino es una correccion, y va por el update directo de estado.
-- -----------------------------------------------------------------------------
create or replace function public.assign_order(p_order_id uuid, p_courier_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0022';
  end if;
  if exists (select 1 from public.order_rounds r where r.id = v_order.round_id and r.status = 'open') then
    raise exception 'ROUND_STILL_OPEN' using errcode = 'P0023';
  end if;
  if v_order.status not in ('pending', 'assigned', 'failed') then
    raise exception 'TRANSITION_INVALID' using errcode = 'P0025';
  end if;
  if p_courier_id is not null and not exists (
    select 1 from public.profiles where id = p_courier_id and role = 'courier'
  ) then
    raise exception 'NOT_A_COURIER' using errcode = 'P0026';
  end if;

  update public.orders
  set status     = case when p_courier_id is null then 'pending'::public.order_status
                        else 'assigned'::public.order_status end,
      courier_id = p_courier_id,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke all on function public.start_shift()                           from public, anon;
revoke all on function public.end_shift()                             from public, anon;
revoke all on function public.report_position(double precision, double precision, real, real, real, timestamptz) from public, anon;
revoke all on function public.claim_order(uuid)                       from public, anon;
revoke all on function public.courier_update_order(uuid, public.order_status) from public, anon;
revoke all on function public.assign_order(uuid, uuid)                from public, anon;
grant execute on function public.start_shift()                        to authenticated;
grant execute on function public.end_shift()                          to authenticated;
grant execute on function public.report_position(double precision, double precision, real, real, real, timestamptz) to authenticated;
grant execute on function public.claim_order(uuid)                    to authenticated;
grant execute on function public.courier_update_order(uuid, public.order_status) to authenticated;
grant execute on function public.assign_order(uuid, uuid)             to authenticated;

-- Los triggers no se llaman por RPC.
revoke all on function public.orders_normalize_status() from public, anon, authenticated;
revoke all on function public.orders_log_event()        from public, anon, authenticated;
revoke all on function public.order_rounds_notify()     from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sin Supabase Realtime: el tiempo real es NOTIFY + psy-ws (ver el encabezado).
-- Si una version anterior de esta migracion las publico, se sacan: Realtime
-- cobra por mensaje y por conexion, y nadie las escucha.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array['orders', 'courier_presence'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
