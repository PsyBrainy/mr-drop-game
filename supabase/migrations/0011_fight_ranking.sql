-- =============================================================================
-- Mister Drop · ranking de peleas
--
-- El ranking de la pelea online es "ganadas y perdidas" por concurso. Sale de
-- fight_matches, y cuenta SOLO lo que se pudo confirmar:
--
--   1. Los dos jugadores tenían identidad verificada (verified_players).
--   2. El validador volvió a jugar la partida con el log de inputs y confirmó
--      quién ganó (verdict = 'ok'). Lo que dijeron los navegadores no alcanza:
--      el ganador que vale es validated_winner, el que salió de re-simular.
--   3. La partida se jugó desde un concurso (event_game_id). Las del sandbox se
--      guardan igual, pero no cuentan para ningún ranking.
--
-- Abandonar es perder: si alguien se va en el medio, el servidor lo anota como
-- 'forfeit' con el otro de ganador. Si se fue DESPUÉS de que la pelea ya había
-- terminado, manda la re-simulación (irse después de ganar no regala nada).
--
-- Quién escribe qué:
--   psy-ws     inserta la fila al terminar la partida (con event_game_id y
--              sim_version), y consulta fight_entry_error() antes de dejar a
--              alguien entrar a la cola de un concurso.
--   validador  (validator/ en este repo) completa verdict, validated_winner,
--              validated y validated_at. Nada más toca esas columnas.
--   navegador  sólo lee el ranking, por la vista fight_leaderboard.
-- =============================================================================

alter table public.fight_matches
  add column if not exists event_game_id uuid references public.event_games (id) on delete set null,
  add column if not exists sim_version integer,
  add column if not exists verdict text check (verdict in ('ok', 'mismatch', 'unplayable')),
  add column if not exists verdict_reason text,
  add column if not exists validated_winner smallint check (validated_winner in (0, 1)),
  add column if not exists validated_at timestamptz;

comment on column public.fight_matches.event_game_id is
  'Desde qué juego de concurso se jugó. Null: sandbox, no cuenta para ningún ranking.';
comment on column public.fight_matches.sim_version is
  'Versión de la sim con la que se jugó. El validador sólo re-simula las de su misma versión.';
comment on column public.fight_matches.verdict is
  'Lo que dijo el validador: ok (cuenta), mismatch (el replay no coincide con el resultado), unplayable (no se puede validar). Null: pendiente.';
comment on column public.fight_matches.validated_winner is
  'El ganador confirmado re-simulando. Es el que usa el ranking, no winner.';

-- La cola del validador: las que tienen resultado y nadie miró todavía.
drop index if exists public.fight_matches_pending_idx;
create index if not exists fight_matches_pending_idx
  on public.fight_matches (finished_at)
  where verdict is null and ending in ('decided', 'forfeit');

create index if not exists fight_matches_ranking_idx
  on public.fight_matches (event_game_id)
  where verdict = 'ok';

-- -----------------------------------------------------------------------------
-- ¿Puede este usuario entrar a la pelea de este juego de concurso?
--
-- Lo llama psy-ws antes de ponerlo en cola. Devuelve null si puede, o el motivo
-- si no. Son las mismas reglas que start_game_session: el juego prendido, el
-- concurso abierto, y participar del concurso (en juego libre no hace falta
-- código: la primera pelea lo inscribe, como la primera partida de cualquier
-- juego).
-- -----------------------------------------------------------------------------
create or replace function public.fight_entry_error(p_event_game_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eg    public.event_games%rowtype;
  v_event public.events%rowtype;
  v_slug  text;
begin
  select * into v_eg from public.event_games where id = p_event_game_id;
  if not found or not v_eg.is_enabled then
    return 'GAME_DISABLED';
  end if;

  select slug into v_slug from public.games where id = v_eg.game_id;
  if v_slug is distinct from 'fight-online' then
    return 'NOT_A_FIGHT';
  end if;

  select * into v_event from public.events where id = v_eg.event_id;
  if not public.event_is_open(v_event) then
    return 'EVENT_CLOSED';
  end if;

  if exists (
    select 1 from public.participations
    where event_id = v_eg.event_id and user_id = p_user_id
  ) then
    return null;
  end if;

  if not v_event.is_free_play then
    return 'NOT_PARTICIPANT';
  end if;

  -- Juego libre: la primera pelea inscribe al usuario.
  insert into public.participations (event_id, user_id)
  values (v_event.id, p_user_id)
  on conflict (event_id, user_id) do nothing;
  return null;
end;
$$;

-- Sólo el servidor la usa (se conecta con el usuario de la base, que la puede
-- ejecutar igual). Un navegador no tiene nada que preguntarle.
revoke all on function public.fight_entry_error(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- El ranking: ganadas y perdidas por jugador, en cada juego de concurso.
--
-- Es público como el de puntaje: muestra nombre, avatar y el conteo, nunca las
-- partidas (que siguen protegidas por el RLS de fight_matches). Los empates
-- confirmados no suman ni restan.
-- -----------------------------------------------------------------------------
create or replace view public.fight_leaderboard
with (security_invoker = false)
as
with counted as (
  select event_game_id, player_one, player_two, validated_winner
  from public.fight_matches
  where verdict = 'ok'
    and verified_players
    and event_game_id is not null
    and validated_winner is not null
),
sides as (
  select event_game_id, player_one as player, validated_winner = 0 as won from counted
  union all
  select event_game_id, player_two as player, validated_winner = 1 as won from counted
)
select
  eg.event_id,
  s.event_game_id,
  pr.id                                   as user_id,
  pr.display_name,
  pr.avatar_url,
  count(*) filter (where s.won)::integer  as wins,
  count(*) filter (where not s.won)::integer as losses
from sides s
join public.event_games eg on eg.id = s.event_game_id
join public.profiles    pr on pr.id::text = s.player
group by eg.event_id, s.event_game_id, pr.id, pr.display_name, pr.avatar_url;

grant select on public.fight_leaderboard to anon, authenticated;

notify pgrst, 'reload schema';
