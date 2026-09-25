# Pelea — documentación técnica

Cómo está hecha la pelea por dentro. Lo que no se puede romper está en `reglas.md`; cómo se
juega, en `funcional.md`.

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
    platforms.ts ✓ dónde está cada flotante en cada tick (función pura del tick, sin estado)
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
src/games/modules/fightCountdown.ts  ✓ "3, 2, 1, ¡Buenos Humos!" antes del tick 0 (online y bot)
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
registry no la ofrece y el panel lo dice. Rankea desde M4 (ver `funcional.md`, "Ranking").

**La pelea local no existe salvo que se pida.** Se juega de a dos en un solo teclado y no hay
resultado que valga: sólo se registra con `VITE_ENABLE_FIGHT_LOCAL=true` (en el `.env` local), y
aun así es `sandboxOnly`. Sin la variable no aparece ni en el sandbox.

**Para probarlo:** con `VITE_ENABLE_FIGHT_LOCAL=true`, `npm run dev` y abrir
`/sandbox?juego=fight-local` (los controles de cada jugador están en `funcional.md`). Con
`/sandbox?juego=fight-local&cajas` se dibujan las cajas de golpe mientras están activas: es la
forma de ver el frame data jugando. Sin `cajas` no se ven, como en el juego. El sandbox monta
cualquier juego del registry sin Supabase, sin evento y sin código.

Algo se ve raro ahí y es esperado: en una pestaña de fondo el canvas queda negro y el tick
casi no avanza (Kaplay pausa su loop y el navegador no despacha animation frames).

`src/fight/__tests__/purity.test.ts` hace cumplir mecánicamente las reglas de `reglas.md`. No es
decorativo: si la sim se contamina, el test rompe. Si se agrega una regla allá, se agrega ahí.

## Golpes: de un input a un ataque

Desde M6 F0, el golpe que sale se decide con la tabla de Brawlhalla: **botón × dirección ×
piso/aire**.

```
input (1 byte) ──aimOf──> 'neutral' | 'side' | 'down'
                              │
grounded + 'light'|'heavy' ───┴──moveFor──> MoveKey ──> tuning.moves[key] (frame data)
```

- `sim/moves.ts`: `aimOf(input)` y `moveFor(grounded, button, aim)`. Funciones puras del byte y de
  `grounded`: no miran nada más del estado.
- Tres direcciones: arriba cuenta como neutro; abajo le gana al costado (la diagonal da el bajo);
  izquierda + derecha es neutro.
- `sim/attack.ts`: `MoveKey` (los 11), `MOVE_KEYS` (el orden que recorren schema, tests y vista)
  y `MOVE_CODES` (el número para el hash; un código no se reusa ni se renumera).

| | Neutro | Costado | Abajo |
| --- | --- | --- | --- |
| Rápido, piso | `nLight` | `sLight` | `dLight` |
| Fuerte, piso | `nSig` | `sSig` | `dSig` |
| Rápido, aire | `nAir` | `sAir` | `dAir` |
| Fuerte, aire | `recovery` | `recovery` | `groundPound` |

- En `applyInput`, los golpes se evalúan **antes** que bajarse de una flotante: abajo + golpe
  arriba de una es `dLight`.
- Pegar de costado gira al personaje hacia ese lado (como antes).
- `data/schema.ts` exige los 11 golpes. Un personaje puede repetir el mismo objeto en varios
  casilleros (el Oso lo hace en F0), pero los escribe todos.
- La vista no decide nada con esto: `fightSprites.config.ts` tiene `MOVE_ANIM` (qué hoja dibuja
  cada golpe) y una tabla de poses por golpe, y `fightSounds.ts` tiene `MOVE_SOUND` (qué familia
  de sonidos suena). Mientras un golpe no tenga dibujo ni sonido propio, usa los de su familia.
  Cuando un golpe cambie de frame data, el test de duración de `fightSprites.config.test.ts`
  pide su tabla de poses propia.
- Tests: `__tests__/moves.test.ts` (la tabla es completa, cada input da un golpe, el tick la usa)
  y en `platforms.test.ts` el caso de abajo + golpe arriba de la flotante.

## Versión de la sim

`SIM_VERSION` (`src/fight/version.ts`) sube cada vez que los mismos inputs producen otro estado.
Dos clientes con versiones distintas no pueden jugar juntos, y el validador marca como
`unplayable` las partidas jugadas con una versión anterior a la suya: **antes de publicar una
versión nueva, que el validador haya procesado las pendientes**. El historial de cada versión
está en el comentario de `version.ts` y en `memoria.md`.

Subirla toca **dos repos en el mismo cambio**: `SIM_VERSION` y `protocol.fixtures.json` en mrdrop,
y `fight.sim-version` (`src/main/resources/application.properties`) y su copia de
`protocol.fixtures.json` en psy-ws. Un cliente con otra versión recibe `SIM_VERSION_MISMATCH`
("El juego se actualizó: recargá la página"), así que web y servidor se publican juntos.
