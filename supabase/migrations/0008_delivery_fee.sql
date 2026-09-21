-- =============================================================================
-- Mister Drop · costo de envio por zona
--
-- Una sola fila de configuracion: precio dentro del casco urbano, precio
-- fuera, y el poligono del casco (lo edita el admin arrastrando vertices).
-- El costo lo decide la base al armar el pedido, con la direccion del
-- usuario: el cliente solo lo muestra. Queda copiado en el pedido para que
-- cambiar los precios despues no toque lo ya pedido.
-- =============================================================================

create table if not exists public.delivery_settings (
  id          boolean primary key default true check (id),
  fee_inside  numeric(10, 2) not null default 0 check (fee_inside >= 0),
  fee_outside numeric(10, 2) not null default 0 check (fee_outside >= 0),
  -- [{ "lat": -34.9, "lng": -57.9 }, ...] en orden, sin repetir el primero.
  zone        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

comment on table public.delivery_settings is 'Fila unica (id = true). Zona = casco urbano.';

-- Casco urbano de La Plata: vertices del poligono administrativo de la ciudad en OSM.
insert into public.delivery_settings (id, fee_inside, fee_outside, zone)
values (
  true, 0, 0,
  '[{"lat": -34.8875541, "lng": -57.9534794},
    {"lat": -34.9175123, "lng": -57.9131216},
    {"lat": -34.9539303, "lng": -57.9530324},
    {"lat": -34.9225633, "lng": -57.9940849}]'::jsonb
)
on conflict (id) do nothing;

alter table public.delivery_settings enable row level security;

drop policy if exists "envio visible" on public.delivery_settings;
create policy "envio visible"
  on public.delivery_settings for select to authenticated using (true);

drop policy if exists "admin configura envio" on public.delivery_settings;
create policy "admin configura envio"
  on public.delivery_settings for all using (public.is_admin()) with check (public.is_admin());

-- Punto en poligono (ray casting). Zona vacia = todo es "adentro".
create or replace function public.delivery_zone_contains(p_lat double precision, p_lng double precision)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_zone   jsonb;
  v_n      integer;
  v_i      integer;
  v_j      integer;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
  v_inside boolean := false;
begin
  select zone into v_zone from public.delivery_settings where id = true;
  v_n := coalesce(jsonb_array_length(v_zone), 0);
  if v_n < 3 then
    return true;
  end if;

  v_j := v_n - 1;
  for v_i in 0 .. v_n - 1 loop
    xi := (v_zone -> v_i ->> 'lng')::double precision;
    yi := (v_zone -> v_i ->> 'lat')::double precision;
    xj := (v_zone -> v_j ->> 'lng')::double precision;
    yj := (v_zone -> v_j ->> 'lat')::double precision;
    if ((yi > p_lat) <> (yj > p_lat))
       and (p_lng < (xj - xi) * (p_lat - yi) / (yj - yi) + xi) then
      v_inside := not v_inside;
    end if;
    v_j := v_i;
  end loop;

  return v_inside;
end;
$$;

alter table public.orders
  add column if not exists delivery_fee    numeric(10, 2) not null default 0,
  add column if not exists delivery_inside boolean;

create or replace function public.place_order(p_items jsonb, p_notes text default '')
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round    public.order_rounds%rowtype;
  v_address  public.user_addresses%rowtype;
  v_settings public.delivery_settings%rowtype;
  v_order    public.orders%rowtype;
  v_item     record;
  v_product  public.products%rowtype;
  v_subtotal numeric(10, 2) := 0;
  v_count    integer := 0;
  v_inside   boolean;
  v_fee      numeric(10, 2);
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

  select * into v_settings from public.delivery_settings where id = true;
  v_inside := public.delivery_zone_contains(v_address.lat, v_address.lng);
  v_fee := case when v_inside then coalesce(v_settings.fee_inside, 0) else coalesce(v_settings.fee_outside, 0) end;

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

    v_subtotal := v_subtotal + v_product.price * v_item.quantity;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'ORDER_EMPTY' using errcode = 'P0012';
  end if;

  update public.orders
  set status          = 'pending',
      notes           = coalesce(p_notes, ''),
      total           = v_subtotal + v_fee,
      delivery_fee    = v_fee,
      delivery_inside = v_inside,
      lat             = v_address.lat,
      lng             = v_address.lng,
      address_label   = v_address.label,
      updated_at      = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

notify pgrst, 'reload schema';
