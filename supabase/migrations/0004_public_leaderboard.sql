-- =============================================================================
-- Mister Drop · ranking publico
--
-- La vista leaderboard corria con security_invoker, asi que cada jugador veia
-- solo su propia fila (y sin cuenta, nada). El ranking es publico a proposito:
-- expone nombre, avatar y mejor puntaje, nunca las partidas individuales, que
-- siguen protegidas por el RLS de game_sessions.
-- =============================================================================

alter view public.leaderboard set (security_invoker = false);

grant select on public.leaderboard to anon, authenticated;

notify pgrst, 'reload schema';
