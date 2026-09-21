-- =============================================================================
-- Mister Drop · direccion de entrega
--
-- Va en una tabla aparte y no en profiles a proposito: profiles es legible por
-- todos (el ranking necesita nombre y avatar), y la direccion exacta de una
-- persona solo la tienen que ver ella misma y el admin.
-- =============================================================================

create table if not exists public.user_addresses (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  label      text not null default '' check (char_length(label) <= 200),
  updated_at timestamptz not null default now()
);

comment on table public.user_addresses is
  'Ubicacion elegida por el usuario en el mapa. Solo la ve el dueño y el admin.';

create or replace function public.touch_user_address()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_addresses_touch on public.user_addresses;
create trigger user_addresses_touch
  before update on public.user_addresses
  for each row execute function public.touch_user_address();

alter table public.user_addresses enable row level security;

drop policy if exists "veo mi direccion" on public.user_addresses;
create policy "veo mi direccion"
  on public.user_addresses for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "cargo mi direccion" on public.user_addresses;
create policy "cargo mi direccion"
  on public.user_addresses for insert
  with check (user_id = auth.uid());

drop policy if exists "edito mi direccion" on public.user_addresses;
create policy "edito mi direccion"
  on public.user_addresses for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "borro mi direccion" on public.user_addresses;
create policy "borro mi direccion"
  on public.user_addresses for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on public.user_addresses to authenticated;

notify pgrst, 'reload schema';
