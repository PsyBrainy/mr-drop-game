-- =============================================================================
-- Datos de ejemplo para arrancar. Corrélo despues de 0001_init.sql.
-- =============================================================================

-- Catalogo: el slug DEBE existir en src/games/registry.ts
insert into public.games (slug, name, description, engine)
values (
  'mrdrop-run',
  'MrDrop Run',
  'Manejá la pickup y saltá los pozos y los patrulleros. Agarrá cogollos al vuelo y no choques.',
  'kaplay'
)
on conflict (slug) do nothing;

-- Concurso de prueba, ya en vivo
insert into public.events (slug, name, description, prize, status, starts_at, ends_at)
values (
  'primer-drop',
  'Primer Drop',
  'El concurso inaugural de la comunidad MrDrop.',
  'Kit MrDrop + merch para el top 3',
  'live',
  now() - interval '1 hour',
  now() + interval '30 days'
)
on conflict (slug) do nothing;

-- Habilitar el juego en ese concurso
insert into public.event_games (event_id, game_id, is_enabled, position, max_plays)
select e.id, g.id, true, 0, 3
from public.events e, public.games g
where e.slug = 'primer-drop' and g.slug = 'mrdrop-run'
on conflict (event_id, game_id) do update set is_enabled = excluded.is_enabled;

-- Codigo de acceso de prueba: /codigo/MRDROP24
insert into public.access_codes (event_id, code, label, max_uses)
select e.id, 'MRDROP24', 'Código de prueba', 500
from public.events e
where e.slug = 'primer-drop'
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Hacete admin: registrate primero en la app y despues corré esto con tu email.
-- -----------------------------------------------------------------------------
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'TU-EMAIL@ejemplo.com');
