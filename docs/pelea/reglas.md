# Pelea — reglas

Las reglas que no se negocian. Este archivo se importa desde `mrdrop/CLAUDE.md`, así que está
siempre cargado. `src/fight/__tests__/purity.test.ts` hace cumplir mecánicamente las de
determinismo: si se agrega una regla acá que se pueda verificar a máquina, se agrega ahí.

## 1. La sim no conoce al motor de render

`src/fight/sim` y `src/fight/data` **no importan nada**: ni `kaplay`, ni React, ni Supabase, ni
`@ui`, ni `@games`, ni `@infrastructure`. Sólo se importan entre ellos. Nada de `document`,
`window`, `requestAnimationFrame`, `setTimeout`.

`stateMachine`, `fighterPhysics` y `hitboxManager` **no son componentes de Kaplay**: son
funciones puras sobre datos planos. Los componentes de Kaplay se quedan con lo que sí es de
Kaplay: `sprite()`, animación, `z`, partículas, shake de cámara.

Esto no es purismo: es lo que permite correr la sim en Vitest, re-simularla headless en Node
para validar resultados, y hashear el estado para detectar desyncs.

## 2. Presupuesto de determinismo

- **Prohibidas las funciones transcendentales**: `Math.sin`, `cos`, `tan`, `pow`, `exp`, `log`,
  `atan2`, `hypot`, `cbrt`. IEEE754 garantiza `+ - * /` y `sqrt` exactos entre plataformas;
  el resto **no**. Si hace falta un seno, va tabla de lookup en punto fijo.
- **Prohibido `Math.random()`**: `rng.ts` con semilla del servidor. Toda aleatoriedad es
  reproducible o no existe.
- **Prohibido leer el reloj**: `Date.now()`, `performance.now()`, `new Date()`. El tiempo en la
  sim es el número de tick. Nada más.
- **Posiciones y velocidades en punto fijo.** El float se queda en la vista, para interpolar.
- **Todo orden de iteración es explícito.** Nada de recorrer un `Map` y confiar en cómo quedó
  armado; se itera por índice de jugador / índice de entidad. Los `sort` usan un orden total
  (si dos elementos empatan, desempata el índice).
- `step()` no muta lo que recibe.

## 3. El tick tiene un orden de fases, y es éste

60 ticks por segundo fijos. `tick.ts`:

1. Avanzar timers (startup / active / recovery, hitstun, invulnerabilidad)
2. Aplicar input y transiciones de la máquina de estados (jugador 0, después jugador 1)
3. Integrar física (gravedad, fricción, clamps)
4. Calcular las cajas de golpe del frame data. No se instancia nada: la caja es un dato
   derivado del reloj del ataque, y un objeto de verdad habría que crearlo y destruirlo en el
   frame exacto en los dos peers, que es una fuente de desync a cambio de nada
5. Detectar golpes en pares de orden fijo: (0 → 1), (1 → 0), y recién después el choque
6. Aplicar knockback e hitstun (el vector escala con el daño acumulado, como Brawlhalla).
   Detectar y aplicar van separados: mover a alguien en el medio cambiaría el estado contra el
   que se resuelve el otro golpe
7. Límites del mundo: ring-out, KO, stocks
8. `tick++`

**Prohibido `onCollide` de Kaplay en la sim** (y `body()`, `area()` con lógica, `wait()`,
`loop()` para timing de gameplay). El orden explícito *es* el determinismo. Cada swing lleva un
`hitId` para no pegar dos veces con el mismo golpe.

## 4. El frame data es data

- En **frames**, nunca en segundos. `startup >= 1`, `active >= 1`, `recovery >= 1`.
- Validado con Zod al cargar. Un personaje mal escrito falla al arrancar, no en medio de un match.
- Tests de invariantes de jugabilidad, al estilo `jumpWindow`: que exista hurtbox durante todo el
  recovery, que ningún ataque mate antes de X de daño acumulado, que los frames sumen la
  duración declarada de la animación.
- **La vista no lee frame data para decidir nada.** La lee para saber qué dibujar.

## 5. Red

- **Delay-based primero, rollback después.** Input delay fijo, arrancar en 4 frames (~66 ms).
  Cuando el input del rival igual no llegó, la simulación **se frena**. Congelarse es feo, pero
  adivinar el input que falta es rollback — y eso es M5. Un juego que se traba medio segundo es
  preferible a uno donde cada uno vio una partida distinta.
- Cada paquete lleva los **últimos 8 frames de input**, redundantes. WebSocket es TCP: un
  paquete demorado no puede congelar la partida.
- El cliente **no manda estado, manda input.** Nunca "morí" ni "le pegué": sólo botones.
- Cada 30 frames los peers intercambian el hash del estado. **Si difiere, el match se aborta y
  se loguea.** Prohibido seguir jugando con un desync: es la diferencia entre un bug que se
  arregla en una tarde y uno que no se puede reproducir nunca.
- `protocol.ts` es la fuente única del contrato: acá vive la simulación, así que acá se define
  el protocolo. psy-ws lo refleja, y `protocol.fixtures.json` está commiteado en los dos repos y
  los dos lo verifican. **Al cambiar el protocolo se edita el fixture en los dos lados, o no se
  cambia.** El servidor y su harness están documentados en `psy-ws/CLAUDE.md`.
- **La cuenta del arranque no es de la sim.** "3, 2, 1, ¡Buenos Humos!" pasa *antes* del tick
  0: la vista no llama a `session.tick()` hasta que termina, así que no cambia `SIM_VERSION` ni el
  replay. Saltearla no adelanta nada (la sesión se frena esperando al rival). Tiene que entrar
  holgada en `fight.silence-timeout-seconds` de psy-ws, porque contando no se mandan inputs; lo
  verifica `fightCountdown.test.ts`.
- El transporte está detrás de `Transport` (`net/port.ts`). WebSocket hoy; si algún día hace
  falta UDP real (WebTransport / WebRTC DataChannel) se cambia el adaptador y la sim no se entera.

## 6. La vista puede leer el estado, nunca al revés

La cámara, las barras y la interpolación salen del `MatchState` y no vuelven a él. Si algo de
la vista pudiera influir en la simulación, dos jugadores con ventanas de distinto tamaño
estarían jugando a cosas distintas — y el desync no aparecería hasta que alguien pusiera el
juego en pantalla completa.

Por lo mismo, un dato que ya existe no se duplica para mostrarlo: la barra de resistencia es
`maxResistance - damage` calculado al dibujar, no un campo aparte. Dos campos que dicen lo
mismo terminan diciendo cosas distintas.

## 7. El clock de la sim es propio

**El loop de la sim no puede vivir en `k.onUpdate`.** Kaplay pausa su loop cuando
`document.visibilityState` no es `"visible"` (está documentado en `createKaplayGame.ts`): en un
juego online eso es un desync, no un canvas negro. La sim corre en su propio clock — idealmente
un Web Worker — y Kaplay sólo dibuja el estado que le pasan, interpolando entre el tick anterior
y el actual. El render va a los FPS que dé el navegador; la sim va a 60 y nada la mueve de ahí.

Aun así, un navegador puede estrangular timers en una pestaña de fondo. Eso lo resuelve el
servidor (timeout → forfeit), no el cliente.

## 8. La pelea no es un `GameModule`

`GameModule` es un contrato single-player de puntaje (`onScoreChange` / `onGameOver(score)`).
Una pelea no tiene score: tiene match, oponente y resultado. **No se fuerza la pelea dentro de
`GameModule`.** Va un contrato hermano:

- `src/games/MatchModule.ts` → `MatchContext` (índice del jugador local, oponente, transporte,
  `onMatchEnd(result)`) y `MatchHandle`.
- `registry.ts` tiene entradas discriminadas (`kind: 'score' | 'match'`) ✓. Con `match`, la
  página de juego no abre sesión, no gasta intentos ni guarda puntaje; muestra el ranking de
  peleas (`FightRanking.tsx`: ganadas / perdidas) en vez del de puntaje. Los juegos que ya
  existen no se tocan.
- La pelea dibuja su propio HUD en HTML (`fightHud.ts`, `ownHud` en el registry) ✓: vidas,
  resistencia y el nombre sobre cada personaje, no puntaje.
- El resultado va a `fight_matches` (lo escribe psy-ws; el veredicto, el validador) ✓.
  **Prohibido** mapear una pelea a `finish_game_session(score)` para que "entre" en el ranking
  actual.

## Cómo trabajar acá

- Un bug de gameplay se reporta con un **archivo de replay**, no con una descripción. Si no hay
  replay, el primer paso es conseguirlo.
- Todo cambio de balance o de física entra con su test de invariante. Un número sin test no entra.
- **Todo avance de la pelea se documenta en `docs/pelea/`, en el mismo commit que el código.**
  El estado en `tareas.md`, las decisiones y mediciones en `memoria.md`, y `funcional.md` /
  `tecnica.md` si cambió cómo se juega o cómo está hecho. Cada cosa en un solo archivo: dos
  lugares que dicen lo mismo terminan diciendo cosas distintas (el índice es `README.md`).
- Si algo obliga a violar una regla de arriba: se discute y se cambia la regla en este archivo.
  No se hace la excepción en silencio.
