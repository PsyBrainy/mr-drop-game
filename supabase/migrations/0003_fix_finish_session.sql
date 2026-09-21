-- =============================================================================
-- Mister Drop · finish_game_session
--
-- Repone la función de cierre de partida (faltaba en bases donde 0001 quedó a
-- medias) y corrige la lectura de la sesión: el SELECT INTO con varios destinos
-- asignaba columna por columna y rompía en runtime.
-- =============================================================================

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

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select user_id into v_owner
  from public.participations
  where id = v_session.participation_id;

  if v_owner is distinct from auth.uid() then
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

revoke all on function public.finish_game_session(uuid, integer, jsonb) from public, anon;
grant execute on function public.finish_game_session(uuid, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
