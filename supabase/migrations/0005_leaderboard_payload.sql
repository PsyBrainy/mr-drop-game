-- Reemplazamos el GROUP BY por DISTINCT ON para poder traernos el payload
-- de la partida exacta que tuvo el mejor puntaje.

drop view if exists public.leaderboard;

create or replace view public.leaderboard
with (security_invoker = false)
as
select distinct on (eg.event_id, eg.id, g.slug, p.user_id, pr.display_name, pr.avatar_url)
  eg.event_id,
  eg.id                              as event_game_id,
  g.slug                             as game_slug,
  p.user_id,
  pr.display_name,
  pr.avatar_url,
  s.score                            as best_score,
  s.finished_at                      as first_finished_at,
  count(*) over (partition by eg.id, p.user_id) as plays,
  s.payload                          as payload
from public.game_sessions s
join public.event_games   eg on eg.id = s.event_game_id
join public.games         g  on g.id  = eg.game_id
join public.participations p on p.id  = s.participation_id
join public.profiles      pr on pr.id = p.user_id
where s.status = 'finished'
-- El orden es fundamental para que DISTINCT ON agarre el correcto:
-- 1. Las columnas del DISTINCT ON
-- 2. best_score DESC (para agarrar el mayor puntaje de ese usuario en este juego)
-- 3. first_finished_at ASC (en caso de empate, la partida mas vieja gana)
order by eg.event_id, eg.id, g.slug, p.user_id, pr.display_name, pr.avatar_url, s.score desc, s.finished_at asc;

grant select on public.leaderboard to anon, authenticated;
