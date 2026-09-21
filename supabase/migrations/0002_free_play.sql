-- =============================================================================
-- Mister Drop · juego libre
--
-- Un evento marcado como `is_free_play` es la sección de juego libre: no hace
-- falta código, los intentos son ilimitados y el ranking es permanente. Se
-- reusa todo el modelo (event_games, participations, game_sessions,
-- leaderboard): la participación se crea sola la primera vez que el usuario
-- juega, y el admin habilita juegos con el mismo panel que en un concurso.
-- =============================================================================

alter table public.events
  add column if not exists is_free_play boolean not null default false;

comment on column public.events.is_free_play is
  'Sección de juego libre: sin código, intentos ilimitados. Se muestra en /jugar.';

-- Abre una partida. En juego libre no exige código ni limita intentos.
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
    if not v_event.is_free_play then
      raise exception 'NOT_PARTICIPANT' using errcode = 'P0007';
    end if;

    -- Juego libre: la primera partida inscribe al usuario.
    insert into public.participations (event_id, user_id)
    values (v_event.id, auth.uid())
    on conflict (event_id, user_id) do nothing;

    select id into v_participation
    from public.participations
    where event_id = v_eg.event_id and user_id = auth.uid();
  end if;

  if not v_event.is_free_play then
    select count(*) into v_plays
    from public.game_sessions
    where participation_id = v_participation
      and event_game_id = v_eg.id
      and status <> 'abandoned';

    if v_plays >= v_eg.max_plays then
      raise exception 'NO_PLAYS_LEFT' using errcode = 'P0008';
    end if;
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

-- La sección de juego libre, ya en vivo y sin fecha de cierre. Los juegos se
-- habilitan desde el Panel.
insert into public.events (slug, name, description, prize, status, is_free_play)
values (
  'juego-libre',
  'Juego libre',
  'Jugá cuando quieras, sin código y sin límite de intentos. Tu mejor puntaje queda en el ranking.',
  '',
  'live',
  true
)
on conflict (slug) do nothing;
