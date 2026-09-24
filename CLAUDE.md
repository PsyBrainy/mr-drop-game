# MrDrop — reglas de trabajo

Web de concursos de la comunidad MrDrop (Vite + React 19 + TS, Supabase, juegos en Kaplay).
Arquitectura hexagonal: `domain` (0 deps) → `application` (puertos + casos de uso) →
`infrastructure` (adaptadores). La UI consume casos de uso, nunca repositorios.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Dev server (`dev:host` para probar desde el celular) |
| `npm run lint` | Typecheck (`tsc -b --noEmit`) |
| `npm test` | Vitest |

Antes de entregar cualquier cambio: `npm run lint && npm test`. Los dos, siempre.

## Convenciones que ya rigen el repo

- **Comentarios que explican el *por qué*, no el *qué*.** El estilo del repo está en
  `mrdropRun.config.ts` y `createKaplayGame.ts`: cada número raro tiene arriba el párrafo que
  cuenta de dónde salió y qué se rompe si se cambia. Mantenerlo. En castellano.
- **Nada de texto dentro del canvas.** Kaplay cachea el atlas de fuente a nivel de módulo
  contra el contexto WebGL de la primera instancia; al reiniciar reutiliza una textura de un
  contexto muerto y el texto desaparece. El HUD se manda como datos y lo dibuja React en HTML
  encima del canvas. El detalle completo está en `src/games/GameModule.ts`.
- **Los números de gameplay viven en un `*.config.ts` sin Kaplay, con tests de invariantes.**
  No se ajusta "a ojo" en el archivo de render. `jumpWindow`, `potholeOpensInTime` y `budReach`
  son el modelo a seguir: el test no verifica un número, verifica que el juego *se pueda jugar*.
- **Las medidas de sprites se miden, no se estiman** (bounding box del alfa) y `assets.test.ts`
  las cruza contra el PNG real y contra el techo de VRAM de un celular.
- **Migraciones a mano.** `supabase/migrations/NNNN_*.sql` numeradas en orden, se corren en el
  SQL Editor. No hay CLI de Supabase en este flujo.

---

# Juego de pelea (`src/fight`) — el harness

Juego 1v1 online tipo Brawlhalla. Decisiones cerradas; si alguna se reabre, se actualiza este
archivo en el mismo commit que el código.

## Decisión de red: sim compartida + relay

```
Cliente A ──inputs──┐                      ┌──inputs── Cliente B
  sim TS @60 ticks  ├──  psy-ws (Kotlin)  ─┤  sim TS @60 ticks
  render Kaplay     │   rooms + relay      │  render Kaplay
                    └──  log de inputs ────┘
                              │
                    Node: re-simula headless la misma sim TS
                              │
                    Supabase: resultado y ranking
```

La simulación determinista corre **en los dos clientes**. psy-ws hace matchmaking, rooms y
relay de inputs, y guarda el log. El servidor **no simula en vivo**: la autoridad es diferida —
antes de escribir el ranking, re-simula el log headless en Node con la *misma* sim y compara con
el resultado que reportaron los clientes. Un solo motor, y anti-cheat igual.

Consecuencia que manda sobre todo lo demás: **un solo motor, en TypeScript, y tiene que ser
bit-a-bit reproducible en dos navegadores distintos y en Node.**

## Convivencia con el contrato de juegos existente

`GameModule` es un contrato single-player de puntaje (`onScoreChange` / `onGameOver(score)`).
Una pelea no tiene score: tiene match, oponente y resultado. **No se fuerza la pelea dentro de
`GameModule`.** Va un contrato hermano:

- `src/games/MatchModule.ts` → `MatchContext` (índice del jugador local, oponente, transporte,
  `onMatchEnd(result)`) y `MatchHandle`.
- `registry.ts` tiene entradas discriminadas (`kind: 'score' | 'match'`) ✓. Con `match`, la
  página de juego no abre sesión, no gasta intentos, no guarda puntaje y no muestra ranking: el
  cartel del final es el resultado. Los juegos que ya existen no se tocan.
- La pelea dibuja su propio HUD en HTML (`fightHud.ts`, `ownHud` en el registry) ✓: vidas,
  resistencia y el nombre sobre cada personaje, no puntaje.
- El resultado va a una tabla `matches` nueva (ganador, perdedor, log de inputs, validado sí/no).
  **Prohibido** mapear una pelea a `finish_game_session(score)` para que "entre" en el ranking
  actual.

## Estructura

`✓` es lo que existe; el resto es el destino.

```
src/fight/
  version.ts    ✓ SIM_VERSION, compartida por el replay y el protocolo
  clock.ts      ✓ el reloj de 60 ticks fijos, afuera de la sim y afuera de Kaplay
  camera.ts     ✓ encuadre que sigue a los dos. Vista pura: no entra al estado ni al hash
  sim/          simulación determinista. CERO dependencias, cero DOM, cero Kaplay.
    fixed.ts    ✓ punto fijo (enteros, 1/256 de píxel)
    rng.ts      ✓ xorshift con semilla; la semilla la fija el servidor por match
    input.ts    ✓ bitmask de 1 byte por frame
    world.ts    ✓ el contrato de escenario, personaje y reglas (las instancias van en data/)
    state.ts    ✓ MatchState / Fighter (datos planos, serializables)
    physics.ts  ✓ integración, fricción piso vs aire, piso por cruce, freno del empuje
    tick.ts     ✓ step(state, inputs, world) -> state. El orden de fases vive acá y sólo acá.
    hash.ts     ✓ checksum del estado, para detectar desync
    attack.ts   ✓ el contrato del frame data: fases, cajas, empuje, prioridad
    collision.ts ✓ AABB y solapamiento
    resolve.ts  ✓ hitbox vs hurtbox, un golpe por swing, choque por prioridad
  data/         instancias: el motor define la forma, los datos la llenan.
    stage.ts    ✓ geometría del escenario y sus zonas de muerte
    fighter.ts  ✓ medidas derivadas para los tests de invariantes
    schema.ts   ✓ validación Zod del frame data, al cargar y nunca en el tick
    characters/oso.ts ✓ el personaje entero: física, esquive y los tres ataques
  net/          protocolo y sesión. Puerto de transporte, sin WebSocket concreto adentro.
    protocol.ts ✓ los mensajes. Fuente única de verdad del contrato con psy-ws.
    protocol.fixtures.json ✓ el mismo archivo commiteado en psy-ws; los dos lo verifican
    port.ts     ✓ interface Transport
    session.ts  ✓ delay-based: retrasa el input propio y se frena si falta el del rival
  bot/
    bot.ts      ✓ el rival de la máquina: input a partir del estado, con semilla. Fuera de la sim
  replay/
    format.ts   ✓ log de inputs serializable + re-simulación y traza

src/games/modules/fightView.ts       ✓ el dibujo, compartido por las dos vistas
src/games/modules/fightSprites.config.ts ✓ qué dibujo va en cada frame (pura, con tests de timing)
tools/rasta-sprites/                 ✓ generador del pixel art del rasta (rasta = P1, rasta2 = P2)
src/games/modules/fightStage.config.ts ✓ el arte del escenario (la terraza) y su parallax
tools/fight-stage/                   ✓ generador del escenario: cielo, dos capas de ciudad y la azotea
src/games/modules/fightControls.ts   ✓ el teclado, compartido por las dos vistas
src/games/modules/fightLocal.ts      ✓ vista local: dos jugadores en un teclado, sin red
src/games/modules/fightOnline.ts     ✓ vista online: 1v1 contra otra persona por psy-ws
src/infrastructure/ws/               ✓ el adaptador WebSocket y el token de Supabase
```

**Para jugar online:** levantar psy-ws (`./gradlew bootRun`), poner `VITE_FIGHT_WS_URL` en el
`.env` (está en `.env.example`), y abrir `/sandbox?juego=fight-online` en dos navegadores. Sin
la variable, el juego lo dice en vez de intentar conectarse a cualquier lado.

**Ojo con probar online en dos pestañas de la misma ventana:** el navegador le frena el reloj a
la que está de fondo, así que deja de mandar inputs y el servidor la da por caída. Para probar
en serio hacen falta dos ventanas visibles, o subir `fight.silence-timeout-seconds`.

**La pelea online se ofrece como cualquier juego.** Está en el catálogo (`0010_fight_game.sql`)
y el admin la prende por evento en "Disponibilidad de juegos". Sin `VITE_FIGHT_WS_URL` el
registry no la ofrece y el panel lo dice. Se juega pero **no rankea** hasta M4.

**La pelea local no existe salvo que se pida.** Se juega de a dos en un solo teclado y no hay
resultado que valga: sólo se registra con `VITE_ENABLE_FIGHT_LOCAL=true` (en el `.env` local), y
aun así es `sandboxOnly`. Sin la variable no aparece ni en el sandbox.

**Para probarlo:** con `VITE_ENABLE_FIGHT_LOCAL=true`, `npm run dev` y abrir `/sandbox?juego=fight-local`. Jugador 1 con
`A`/`D`/`W` + `F` rápido, `G` fuerte, `S` esquive; jugador 2 con las flechas + `,` `.` y flecha
abajo. Con `/sandbox?juego=fight-local&cajas` se dibujan las cajas de golpe mientras están
activas: es la forma de ver el frame data jugando. Sin `cajas` no se ven, como en el juego. El sandbox monta cualquier juego del registry sin Supabase, sin evento y sin código.

Algo se ve raro ahí y es esperado: en una pestaña de fondo el canvas queda negro y el tick
casi no avanza (Kaplay pausa su loop y el navegador no despacha animation frames).

`src/fight/__tests__/purity.test.ts` hace cumplir mecánicamente las reglas de abajo. No es
decorativo: si la sim se contamina, el test rompe. Si se agrega una regla acá, se agrega ahí.

## Reglas duras

### 1. La sim no conoce al motor de render

`src/fight/sim` y `src/fight/data` **no importan nada**: ni `kaplay`, ni React, ni Supabase, ni
`@ui`, ni `@games`, ni `@infrastructure`. Sólo se importan entre ellos. Nada de `document`,
`window`, `requestAnimationFrame`, `setTimeout`.

`stateMachine`, `fighterPhysics` y `hitboxManager` **no son componentes de Kaplay**: son
funciones puras sobre datos planos. Los componentes de Kaplay se quedan con lo que sí es de
Kaplay: `sprite()`, animación, `z`, partículas, shake de cámara.

Esto no es purismo: es lo que permite correr la sim en Vitest, re-simularla headless en Node
para validar resultados, y hashear el estado para detectar desyncs.

### 2. Presupuesto de determinismo

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

### 3. El tick tiene un orden de fases, y es éste

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

### 4. El frame data es data

- En **frames**, nunca en segundos. `startup >= 1`, `active >= 1`, `recovery >= 1`.
- Validado con Zod al cargar. Un personaje mal escrito falla al arrancar, no en medio de un match.
- Tests de invariantes de jugabilidad, al estilo `jumpWindow`: que exista hurtbox durante todo el
  recovery, que ningún ataque mate antes de X de daño acumulado, que los frames sumen la
  duración declarada de la animación.
- **La vista no lee frame data para decidir nada.** La lee para saber qué dibujar.

### 5. Red

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
- El transporte está detrás de `Transport` (`net/port.ts`). WebSocket hoy; si algún día hace
  falta UDP real (WebTransport / WebRTC DataChannel) se cambia el adaptador y la sim no se entera.

### 6. La vista puede leer el estado, nunca al revés

La cámara, las barras y la interpolación salen del `MatchState` y no vuelven a él. Si algo de
la vista pudiera influir en la simulación, dos jugadores con ventanas de distinto tamaño
estarían jugando a cosas distintas — y el desync no aparecería hasta que alguien pusiera el
juego en pantalla completa.

Por lo mismo, un dato que ya existe no se duplica para mostrarlo: la barra de resistencia es
`maxResistance - damage` calculado al dibujar, no un campo aparte. Dos campos que dicen lo
mismo terminan diciendo cosas distintas.

### 7. El clock de la sim es propio

**El loop de la sim no puede vivir en `k.onUpdate`.** Kaplay pausa su loop cuando
`document.visibilityState` no es `"visible"` (está documentado en `createKaplayGame.ts`): en un
juego online eso es un desync, no un canvas negro. La sim corre en su propio clock — idealmente
un Web Worker — y Kaplay sólo dibuja el estado que le pasan, interpolando entre el tick anterior
y el actual. El render va a los FPS que dé el navegador; la sim va a 60 y nada la mueve de ahí.

Aun así, un navegador puede estrangular timers en una pestaña de fondo. Eso lo resuelve el
servidor (timeout → forfeit), no el cliente.

## Plan: vertical slice antes que contenido

Brawlhalla son 50+ personajes con 2 armas y ~14 ataques cada una. Eso es *data*. Primero la
arquitectura, con un personaje:

- **M0 ✓** — Harness (este archivo + `purity.test.ts`) y sim que tickea, con el test de replay:
  el mismo log de inputs produce el mismo hash final, y los dos peers coinciden frame a frame.
  Sin esto, nada de lo de abajo es medible.
- **M1 ✓** — Movimiento, salto, plataformas y ring-out, con tests de comportamiento y de
  invariantes, y la vista local en `/sandbox?juego=fight-local` para poder sentir el ajuste.
  Los personajes son rectángulos: los sprites vienen después de que los ataques existan.
- **M2 ✓** — Frame data validado, tres ataques, hitstun, knockback escalado por daño acumulado,
  choque por prioridad, esquive con ventana de invulnerabilidad y castigo por aterrizar en medio
  de un aéreo. Después se sumaron la barra de resistencia, el agarre del borde con salto de
  pared, y la cámara que encuadra a los dos. Queda afuera el movimiento de recuperación aérea:
  cambia el ajuste de la deriva que ya está verificado por el test de recuperación, y merece su
  propia pasada de balance.
- **M3 ✓** — Red, de punta a punta. psy-ws tiene salas, emparejamiento, relé, detección de
  desync, abandono por desconexión o por silencio y archivo por JPA; el cliente tiene la sesión
  delay-based y la vista online. Verificado con dos navegadores contra el servidor de verdad.
  **Queda afuera el contrato `MatchModule`**: hoy no compraría nada — el sandbox monta
  `GameModule` y la pelea no tiene puntaje que registrar. Llega con M4, que es cuando el
  resultado tiene que quedar guardado en algún lado.
- **M4** — Re-simulación headless en Node + tabla `matches` + ranking.
- **M5** — Rollback, sólo si M3 se siente mal con pings reales. No antes.

## Cómo trabajar acá

- Un bug de gameplay se reporta con un **archivo de replay**, no con una descripción. Si no hay
  replay, el primer paso es conseguirlo.
- Todo cambio de balance o de física entra con su test de invariante. Un número sin test no entra.
- Si algo obliga a violar una regla de arriba: se discute y se cambia la regla en este archivo.
  No se hace la excepción en silencio.
