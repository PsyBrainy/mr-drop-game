-- =============================================================================
-- Mister Drop · pedidos por camada
--
-- El admin abre una "camada" (order_round); al abrirla se genera un codigo
-- que solo ve el admin. El usuario canjea ese codigo una vez (se vuelve
-- miembro de la camada) y recien ahi puede pedir. Un pedido por usuario por
-- camada; se puede rearmar o cancelar mientras la camada este abierta. Al
-- cerrarla, el admin reparte y marca cada pedido como entregado.
--
-- Precios y totales los calcula la base: el cliente manda solo ids y
-- cantidades. La direccion se copia al pedido para que la entrega no se
-- mueva si el usuario la edita despues.
-- =============================================================================

-- products ----------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  price       numeric(10, 2) not null check (price >= 0),
  is_active   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "combos activos visibles" on public.products;
create policy "combos activos visibles"
  on public.products for select
  using (is_active or public.is_admin());

drop policy if exists "admin administra combos" on public.products;
create policy "admin administra combos"
  on public.products for all using (public.is_admin()) with check (public.is_admin());

-- order_rounds ------------------------------------------------------------
do $$ begin
  create type public.round_status as enum ('open', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.order_rounds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '' check (char_length(name) <= 80),
  status     public.round_status not null default 'open',
  opened_at  timestamptz not null default now(),
  closed_at  timestamptz
);

-- Una sola camada abierta a la vez.
create unique index if not exists order_rounds_single_open
  on public.order_rounds ((status)) where status = 'open';

alter table public.order_rounds enable row level security;

drop policy if exists "camadas visibles" on public.order_rounds;
create policy "camadas visibles"
  on public.order_rounds for select to authenticated using (true);

drop policy if exists "admin administra camadas" on public.order_rounds;
create policy "admin administra camadas"
  on public.order_rounds for all using (public.is_admin()) with check (public.is_admin());

-- El codigo vive aparte: la tabla de camadas es visible para todos los
-- usuarios (necesitan saber si hay una abierta) y el codigo no.
create table if not exists public.order_round_codes (
  round_id uuid primary key references public.order_rounds (id) on delete cascade,
  code     text not null unique check (code ~ '^[A-Z0-9]{4,12}$')
);

alter table public.order_round_codes enable row level security;

drop policy if exists "admin ve codigos de camada" on public.order_round_codes;
create policy "admin ve codigos de camada"
  on public.order_round_codes for select using (public.is_admin());

create table if not exists public.order_round_members (
  round_id  uuid not null references public.order_rounds (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

alter table public.order_round_members enable row level security;

drop policy if exists "veo mis camadas" on public.order_round_members;
create policy "veo mis camadas"
  on public.order_round_members for select
  using (user_id = auth.uid() or public.is_admin());

-- RPC (admin): abrir camada con codigo generado --------------------------
create or replace function public.open_order_round(p_name text default '')
returns table (round_id uuid, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id       uuid;
  v_code     text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i        integer;
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if exists (select 1 from public.order_rounds where status = 'open') then
    raise exception 'ROUND_ALREADY_OPEN' using errcode = 'P0015';
  end if;

  insert into public.order_rounds (name) values (coalesce(p_name, ''))
  returning id into v_id;

  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.order_round_codes c where c.code = v_code);
  end loop;

  insert into public.order_round_codes (round_id, code) values (v_id, v_code);

  return query select v_id, v_code;
end;
$$;

-- RPC: canjear el codigo de la camada abierta -----------------------------
create or replace function public.join_order_round(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select r.id into v_round_id
  from public.order_rounds r
  join public.order_round_codes c on c.round_id = r.id
  where r.status = 'open'
    and c.code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));

  if v_round_id is null then
    raise exception 'CODE_INVALID' using errcode = 'P0001';
  end if;

  insert into public.order_round_members (round_id, user_id)
  values (v_round_id, auth.uid())
  on conflict do nothing;

  return v_round_id;
end;
$$;

-- orders ------------------------------------------------------------------
do $$ begin
  create type public.order_status as enum ('pending', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.order_rounds (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        public.order_status not null default 'pending',
  notes         text not null default '' check (char_length(notes) <= 300),
  total         numeric(10, 2) not null default 0,
  lat           double precision not null,
  lng           double precision not null,
  address_label text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  unique (round_id, user_id)
);

create index if not exists orders_round_idx on public.orders (round_id, status);

alter table public.orders enable row level security;

drop policy if exists "veo mis pedidos" on public.orders;
create policy "veo mis pedidos"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());

-- El admin solo cambia estado; el alta y la cancelacion del usuario van por RPC.
drop policy if exists "admin actualiza pedidos" on public.orders;
create policy "admin actualiza pedidos"
  on public.orders for update using (public.is_admin()) with check (public.is_admin());

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name       text not null,
  unit_price numeric(10, 2) not null,
  quantity   integer not null check (quantity between 1 and 99)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.order_items enable row level security;

drop policy if exists "veo items de mis pedidos" on public.order_items;
create policy "veo items de mis pedidos"
  on public.order_items for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())
  ));

-- RPC: armar / rearmar el pedido de la camada abierta ---------------------
-- p_items: [{ "product_id": uuid, "quantity": int }, ...]
create or replace function public.place_order(p_items jsonb, p_notes text default '')
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round   public.order_rounds%rowtype;
  v_address public.user_addresses%rowtype;
  v_order   public.orders%rowtype;
  v_item    record;
  v_product public.products%rowtype;
  v_total   numeric(10, 2) := 0;
  v_count   integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_round from public.order_rounds where status = 'open' for update;
  if not found then
    raise exception 'ORDERS_CLOSED' using errcode = 'P0010';
  end if;

  if not exists (
    select 1 from public.order_round_members
    where round_id = v_round.id and user_id = auth.uid()
  ) then
    raise exception 'ROUND_CODE_REQUIRED' using errcode = 'P0016';
  end if;

  select * into v_address from public.user_addresses where user_id = auth.uid();
  if not found then
    raise exception 'ADDRESS_REQUIRED' using errcode = 'P0011';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_EMPTY' using errcode = 'P0012';
  end if;

  select * into v_order
  from public.orders
  where round_id = v_round.id and user_id = auth.uid()
  for update;

  if found and v_order.status = 'delivered' then
    raise exception 'ORDER_DELIVERED' using errcode = 'P0013';
  end if;

  if not found then
    insert into public.orders (round_id, user_id, lat, lng, address_label, notes)
    values (v_round.id, auth.uid(), v_address.lat, v_address.lng, v_address.label, coalesce(p_notes, ''))
    returning * into v_order;
  else
    delete from public.order_items where order_id = v_order.id;
  end if;

  for v_item in
    select (elem->>'product_id')::uuid as product_id,
           (elem->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as elem
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 99 then
      raise exception 'ORDER_EMPTY' using errcode = 'P0012';
    end if;

    select * into v_product from public.products where id = v_item.product_id and is_active;
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0014';
    end if;

    insert into public.order_items (order_id, product_id, name, unit_price, quantity)
    values (v_order.id, v_product.id, v_product.name, v_product.price, v_item.quantity);

    v_total := v_total + v_product.price * v_item.quantity;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'ORDER_EMPTY' using errcode = 'P0012';
  end if;

  update public.orders
  set status        = 'pending',
      notes         = coalesce(p_notes, ''),
      total         = v_total,
      lat           = v_address.lat,
      lng           = v_address.lng,
      address_label = v_address.label,
      updated_at    = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- RPC: cancelar mi pedido mientras la camada siga abierta -----------------
create or replace function public.cancel_my_order()
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select o.* into v_order
  from public.orders o
  join public.order_rounds r on r.id = o.round_id
  where o.user_id = auth.uid() and r.status = 'open'
  for update of o;

  if not found then
    raise exception 'ORDERS_CLOSED' using errcode = 'P0010';
  end if;
  if v_order.status = 'delivered' then
    raise exception 'ORDER_DELIVERED' using errcode = 'P0013';
  end if;

  update public.orders
  set status = 'cancelled', updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.open_order_round(text)   from public, anon;
revoke all on function public.join_order_round(text)   from public, anon;
revoke all on function public.place_order(jsonb, text) from public, anon;
revoke all on function public.cancel_my_order()        from public, anon;
grant execute on function public.open_order_round(text)   to authenticated;
grant execute on function public.join_order_round(text)   to authenticated;
grant execute on function public.place_order(jsonb, text) to authenticated;
grant execute on function public.cancel_my_order()        to authenticated;

notify pgrst, 'reload schema';
