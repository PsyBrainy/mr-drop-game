-- =============================================================================
-- Mister Drop · la pelea en el catalogo
--
-- Carga la pelea online en `games` para que el admin la pueda prender y apagar
-- por evento desde "Disponibilidad de juegos", igual que Mister Drop Run. El
-- slug tiene que coincidir con la clave de src/games/registry.ts.
--
-- Una pelea no usa game_sessions: no gasta intentos ni guarda puntaje (el
-- resultado lo archiva psy-ws en fight_matches). Por eso el interruptor sólo
-- decide si se muestra y se deja entrar; no hay ranking de peleas hasta que los
-- resultados se validen re-simulando el replay.
--
-- La pelea local (dos jugadores en un teclado) NO va al catalogo: es una
-- herramienta de ajuste y sólo existe con VITE_ENABLE_FIGHT_LOCAL.
-- =============================================================================

insert into public.games (slug, name, description, engine)
values (
  'fight-online',
  'Pelea Rasta 1v1',
  'Peleá contra otra persona en la terraza. Sacalo de la pantalla antes de que te saque a vos.',
  'kaplay'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
