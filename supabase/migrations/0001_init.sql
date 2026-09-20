-- =============================================================================
-- MrDrop · esquema inicial
-- Concursos de la comunidad: se entra con un codigo, se juega, se rankea.
-- Toda la autorizacion vive en RLS + funciones SECURITY DEFINER.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('player', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('draft', 'live', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('playing', 'finished', 'abandoned');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- profiles: espejo de auth.users con el rol de la app
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  role         public.app_role not null default 'player',
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'Perfil publico del usuario. El rol se cambia solo desde el dashboard de Supabase.';

-- Alta automatica del perfil al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'dropper'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper de autorizacion, usado por todas las policies de admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- games: catalogo de juegos implementados en el front (slug = modulo kaplay)
-- -----------------------------------------------------------------------------
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name        text not null,
  description text not null default '',
  cover_url   text,
  engine      text not null default 'kaplay',
  created_at  timestamptz not null default now()
);

comment on column public.games.slug is 'Debe coincidir con la clave registrada en src/games/registry.ts';

-- -----------------------------------------------------------------------------
-- events: cada concurso puntual
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name        text not null,
  description text not null default '',
  prize       text not null default '',
  status      public.event_status not null default 'draft',
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint events_window_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);

-- Un evento esta jugable si esta live y dentro de la ventana temporal.
create or replace function public.event_is_open(e public.events)
returns boolean
language sql
immutable
as $$
  select e.status = 'live'
     and (e.starts_at is null or e.starts_at <= now())
     and (e.ends_at   is null or e.ends_at   >  now());
$$;

-- -----------------------------------------------------------------------------
-- event_games: el switch de disponibilidad por evento
-- -----------------------------------------------------------------------------
create table if not exists public.event_games (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  game_id     uuid not null references public.games (id)  on delete restrict,
  is_enabled  boolean not null default false,
  position    smallint not null default 0,
  max_plays   smallint not null default 1 check (max_plays between 1 and 100),
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (event_id, game_id)
);

comment on column public.event_games.max_plays is 'Intentos permitidos por usuario en este juego dentro del evento.';

-- -----------------------------------------------------------------------------
-- access_codes: la llave de entrada. Nunca legible por un jugador.
-- -----------------------------------------------------------------------------
create table if not exists public.access_codes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  code        text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{4,32}$'),
  label       text not null default '',
  max_uses    integer not null default 1 check (max_uses between 1 and 100000),
  used_count  integer not null default 0 check (used_count >= 0),
  expires_at  timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists access_codes_event_idx on public.access_codes (event_id);

-- -----------------------------------------------------------------------------
-- participations: usuario habilitado en un evento
-- -----------------------------------------------------------------------------
create table if not exists public.participations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  access_code_id uuid references public.access_codes (id) on delete set null,
  joined_at      timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists participations_user_idx on public.participations (user_id);

-- -----------------------------------------------------------------------------
-- game_sessions: una partida. El score solo se escribe via RPC.
-- -----------------------------------------------------------------------------
create table if not exists public.game_sessions (
  id               uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.participations (id) on delete cascade,
  event_game_id    uuid not null references public.event_games (id) on delete cascade,
  status           public.session_status not null default 'playing',
  score            integer not null default 0 check (score >= 0),
  payload          jsonb not null default '{}'::jsonb,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create index if not exists game_sessions_lookup_idx
  on public.game_sessions (event_game_id, status, score desc);

-- -----------------------------------------------------------------------------
-- Leaderboard: mejor score por usuario y juego dentro de un evento
-- -----------------------------------------------------------------------------
create or replace view public.leaderboard
with (security_invoker = true)
as
select
  eg.event_id,
  eg.id                              as event_game_id,
  g.slug                             as game_slug,
  p.user_id,
  pr.display_name,
  pr.avatar_url,
  max(s.score)                       as best_score,
  min(s.finished_at)                 as first_finished_at,
  count(*)                           as plays
from public.game_sessions s
join public.event_games   eg on eg.id = s.event_game_id
join public.games         g  on g.id  = eg.game_id
join public.participations p on p.id  = s.participation_id
join public.profiles      pr on pr.id = p.user_id
where s.status = 'finished'
group by eg.event_id, eg.id, g.slug, p.user_id, pr.display_name, pr.avatar_url;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles       enable row level security;
alter table public.games          enable row level security;
alter table public.events         enable row level security;
alter table public.event_games    enable row level security;
alter table public.access_codes   enable row level security;
alter table public.participations enable row level security;
alter table public.game_sessions  enable row level security;

-- profiles ---------------------------------------------------------------
drop policy if exists "perfiles visibles para todos" on public.profiles;
create policy "perfiles visibles para todos"
  on public.profiles for select using (true);

drop policy if exists "cada uno edita su perfil" on public.profiles;
create policy "cada uno edita su perfil"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- games ------------------------------------------------------------------
drop policy if exists "catalogo publico" on public.games;
create policy "catalogo publico"
  on public.games for select using (true);

drop policy if exists "admin administra juegos" on public.games;
create policy "admin administra juegos"
  on public.games for all using (public.is_admin()) with check (public.is_admin());

-- events -----------------------------------------------------------------
drop policy if exists "eventos publicados visibles" on public.events;
create policy "eventos publicados visibles"
  on public.events for select using (status <> 'draft' or public.is_admin());

drop policy if exists "admin administra eventos" on public.events;
create policy "admin administra eventos"
  on public.events for all using (public.is_admin()) with check (public.is_admin());

-- event_games ------------------------------------------------------------
drop policy if exists "juegos habilitados visibles" on public.event_games;
create policy "juegos habilitados visibles"
  on public.event_games for select
  using (
    public.is_admin()
    or (is_enabled and exists (
      select 1 from public.events e
      where e.id = event_id and e.status <> 'draft'
    ))
  );

drop policy if exists "admin administra disponibilidad" on public.event_games;
create policy "admin administra disponibilidad"
  on public.event_games for all using (public.is_admin()) with check (public.is_admin());

-- access_codes: solo admin. Los jugadores canjean via RPC.
drop policy if exists "admin administra codigos" on public.access_codes;
create policy "admin administra codigos"
  on public.access_codes for all using (public.is_admin()) with check (public.is_admin());

-- participations ---------------------------------------------------------
drop policy if exists "veo mis participaciones" on public.participations;
create policy "veo mis participaciones"
  on public.participations for select
  using (user_id = auth.uid() or public.is_admin());

-- game_sessions ----------------------------------------------------------
drop policy if exists "veo mis partidas" on public.game_sessions;
create policy "veo mis partidas"
  on public.game_sessions for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.participations p
      where p.id = participation_id and p.user_id = auth.uid()
    )
  );

-- Nota: no hay policies de INSERT/UPDATE para participations ni game_sessions.
-- Se escriben exclusivamente desde las funciones SECURITY DEFINER de abajo.

-- =============================================================================
-- RPCs
-- =============================================================================

-- Canjea un codigo y deja al usuario participando en el evento.
create or replace function public.redeem_access_code(p_code text)
returns table (event_id uuid, event_slug text, event_name text, already_joined boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code   public.access_codes%rowtype;
  v_event  public.events%rowtype;
  v_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_code
  from public.access_codes
  where code = upper(trim(p_code))
  for update;

  if not found or not v_code.is_active then
    raise exception 'CODE_INVALID' using errcode = 'P0002';
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'CODE_EXPIRED' using errcode = 'P0003';
  end if;

  select * into v_event from public.events where id = v_code.event_id;

  if not public.event_is_open(v_event) then
    raise exception 'EVENT_CLOSED' using errcode = 'P0004';
  end if;

  select exists (
    select 1 from public.participations
    where participations.event_id = v_event.id and user_id = auth.uid()
  ) into v_exists;

  if v_exists then
    return query select v_event.id, v_event.slug, v_event.name, true;
    return;
  end if;

  if v_code.used_count >= v_code.max_uses then
    raise exception 'CODE_EXHAUSTED' using errcode = 'P0005';
  end if;

  insert into public.participations (event_id, user_id, access_code_id)
  values (v_event.id, auth.uid(), v_code.id);

  update public.access_codes
  set used_count = used_count + 1
  where id = v_code.id;

  return query select v_event.id, v_event.slug, v_event.name, false;
end;
$$;

-- Abre una partida si el juego esta habilitado y quedan intentos.
create or replace function public.start_game_session(p_event_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eg             public.event_games%rowtype;
  v_event          public.events%rowtype;
  v_participation  uuid;
  v_plays          integer;
  v_session_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_eg from public.event_games where id = p_event_game_id;
  if not found or not v_eg.is_enabled then
    raise exception 'GAME_DISABLED' using errcode = 'P0006';
  end if;

  select * into v_event from public.events where id = v_eg.event_id;
  if not public.event_is_open(v_event) then
    raise exception 'EVENT_CLOSED' using errcode = 'P0004';
  end if;

  select id into v_participation
  from public.participations
  where event_id = v_eg.event_id and user_id = auth.uid();

  if v_participation is null then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0007';
  end if;

  select count(*) into v_plays
  from public.game_sessions
  where participation_id = v_participation
    and event_game_id = v_eg.id
    and status <> 'abandoned';

  if v_plays >= v_eg.max_plays then
    raise exception 'NO_PLAYS_LEFT' using errcode = 'P0008';
  end if;

  -- Una sola partida abierta por juego: las viejas se descartan.
  update public.game_sessions
  set status = 'abandoned', finished_at = now()
  where participation_id = v_participation
    and event_game_id = v_eg.id
    and status = 'playing';

  insert into public.game_sessions (participation_id, event_game_id)
  values (v_participation, v_eg.id)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

-- Cierra la partida con su score. Solo el duenio, solo una vez.
create or replace function public.finish_game_session(
  p_session_id uuid,
  p_score      integer,
  p_payload    jsonb default '{}'::jsonb
)
returns public.game_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
  v_owner   uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select s.*, p.user_id into v_session, v_owner
  from public.game_sessions s
  join public.participations p on p.id = s.participation_id
  where s.id = p_session_id
  for update of s;

  if not found or v_owner <> auth.uid() then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.status <> 'playing' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0009';
  end if;

  update public.game_sessions
  set score       = greatest(p_score, 0),
      payload     = coalesce(p_payload, '{}'::jsonb),
      status      = 'finished',
      finished_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.redeem_access_code(text)                     from public, anon;
revoke all on function public.start_game_session(uuid)                     from public, anon;
revoke all on function public.finish_game_session(uuid, integer, jsonb)    from public, anon;
grant execute on function public.redeem_access_code(text)                  to authenticated;
grant execute on function public.start_game_session(uuid)                  to authenticated;
grant execute on function public.finish_game_session(uuid, integer, jsonb) to authenticated;
