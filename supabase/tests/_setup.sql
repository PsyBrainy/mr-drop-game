-- =============================================================================
-- Lo mínimo de Supabase para que las migraciones corran en un Postgres pelado,
-- y los dos helpers de los escenarios. Solo para scripts/db-test.sh: nunca se
-- corre en el proyecto de verdad.
--
-- auth.uid() lee request.jwt.claim.sub, igual que en Supabase: en un escenario
-- "ser" alguien es `set role authenticated; set request.jwt.claim.sub = '<id>'`.
-- =============================================================================

-- Los roles son del cluster, no de la base: pueden existir de una corrida anterior.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase da todo sobre public a anon/authenticated y deja que RLS decida.
-- Replicarlo importa: si no, un escenario "pasa" por falta de grant y no por RLS.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Para que el bloque de Realtime de las migraciones tenga a qué agregar tablas.
create publication supabase_realtime;

-- Helpers -------------------------------------------------------------------
create schema test;
grant usage on schema test to anon, authenticated;

-- Corre p_sql y exige que falle con un mensaje que contenga p_expect.
create function test.err(p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ESPERABA % y no falló: %', p_expect, p_sql;
exception when others then
  if sqlerrm like 'ESPERABA%' then raise; end if;
  if position(p_expect in sqlerrm) = 0 then
    raise exception 'ESPERABA % y vino: %', p_expect, sqlerrm;
  end if;
end $$;

create function test.eq(p_got anyelement, p_want anyelement, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception '%: dio %, se esperaba %', p_what, p_got, p_want;
  end if;
end $$;

grant execute on all functions in schema test to anon, authenticated;
