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
    moves.ts    ✓ de un input a un golpe: botón × dirección × piso/aire (la tabla de Brawlhalla)
    collision.ts ✓ AABB y solapamiento
    resolve.ts  ✓ hitbox vs hurtbox, un golpe por swing, choque por prioridad
  data/         instancias: el motor define la forma, los datos la llenan.
    stage.ts    ✓ geometría del escenario y sus zonas de muerte
    fighter.ts  ✓ medidas derivadas para los tests de invariantes
    combos.ts   ✓ ventaja de frames y combos reales, medidos jugando la sim
    schema.ts   ✓ validación Zod del frame data, al cargar y nunca en el tick
    characters/oso.ts ✓ el personaje entero: física, esquive y los tres ataques
  net/          protocolo y sesión. Puerto de transporte, sin WebSocket concreto adentro.
    protocol.ts ✓ los mensajes. Fuente única de verdad del contrato con psy-ws.
    protocol.fixtures.json ✓ el mismo archivo commiteado en psy-ws; los dos lo verifican
    port.ts     ✓ interface Transport
    session.ts  ✓ delay-based: retrasa el input propio y se frena si falta el del rival
  bot/
    bot.ts      ✓ el rival de la máquina: input a partir del estado, con semilla. Fuera de la sim
    lookahead.ts ✓ lo que el bot se imagina con la sim: cómo volver y (el difícil) qué hacer
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
src/games/modules/fightCombo.ts      ✓ el contador de combo del HUD, derivado tick a tick (no entra a la sim)
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
  cada golpe) y una tabla de poses por golpe, y `fightSounds.ts` tiene `MOVE_SOUND`: por golpe,
  los sonidos en orden de preferencia (el propio y después el de su familia). `soundFor` elige
  el primero que el personaje tiene. Hoy tienen sonido propio `nLight`, `sLight`, `sSig`, `nAir`,
  `dAir`, `recovery` y `groundPound`, compartidos por los dos personajes; el resto suena por
  familia.
  Los recortes están en `public/sounds/` (mp3 mono, 44,1 kHz, 96 kbps, pico a -2 dB).
  Cuando un golpe cambie de frame data, el test de duración de `fightSprites.config.test.ts`
  pide su tabla de poses propia.
- **Golpes con impulso** (`motion` en el frame data): en el frame `motion.frame` del ataque, en
  la fase de input, `vy` (y `vx` espejado, si viene) *se reemplazan*. Se aplica antes de la física,
  así que la gravedad hace el arco sola.
- **Una vez por vuelo** (`oncePerAirtime`): al salir el golpe en el aire se prende su bit
  (`airMoveBit`) en `airMovesUsed`. Con el bit prendido el golpe no sale (ni otro en su lugar).
  Se limpia al aterrizar (`moveAndCollide`) y al recibir un golpe (`applyHit`).
- **Gravity cancel**: `startDodge` prende `gravityCancel` si el esquive es en el aire y sin
  dirección. En la rama del esquive de `applyInput`, desde `dodge.attackCancelFrom` y con un golpe
  en el buffer, sale `moveFor(true, …)` (la tabla de piso) aunque esté en el aire. Se apaga al
  usarlo, al terminar el esquive, al aterrizar (`land`) y al recibir un golpe.
- **Aterrizar en medio de un golpe**: sólo los aéreos (`isAerialMove`) se cortan con castigo; un
  golpe de piso tirado en el aire sigue. `landLag` vale el `landingLag` del golpe si lo tiene, y si
  no, `landFrames` del personaje.
- **Empuje en hitstun**: `applyGravity` usa `knockbackMaxSpeed` como techo mientras hay hitstun, y
  `maxFall` el resto del tiempo.
- **Spike**: `applyHit` marca `spiked` si el empuje del golpe es para abajo. `land` (en
  `physics.ts`, lo que pasa al tocar el piso o una flotante) termina el hitstun si llega `spiked`
  todavía aturdido, y lo limpia siempre.
- **Buffer de golpe**: al empezar `applyInput` se anota cualquier golpe apretado (botón y
  dirección) con `attackBufferFrames` de vida, aunque no se pueda pegar. Donde antes se preguntaba
  "¿se apretó recién?", ahora se pregunta "¿hay un golpe guardado?", y al salir se borra.
  `applyHit` lo borra en el que recibe.
- Tests: `__tests__/recovery.test.ts` (el impulso, una vez por vuelo, recargas, volver con y sin
  recovery, nadie flota para siempre), `__tests__/gravityCancel.test.ts` (qué sale, desde cuándo,
  cuándo no, que el golpe de piso siga al aterrizar), `__tests__/aerials.test.ts` (el spike afuera y adentro
  del escenario, la caída en picada, el techo del empuje), `__tests__/buffer.test.ts` (sale en el primer frame libre, se pierde fuera de la
  ventana, guarda la dirección, un golpe lo borra), `__tests__/moves.test.ts` (la tabla es completa, cada input da un golpe, el tick la usa)
  y en `platforms.test.ts` el caso de abajo + golpe arriba de la flotante.

## Sprites y VRAM

- Las hojas del rasta salen de `tools/rasta-sprites` (poses por código, ver su README) a **1x**:
  frames de 96×96, pies en (34, 90). `build.py` escribe en `assets-src/` y se copian a `public/`.
- Golpe con hoja propia: se agrega la función de poses en `anims.py` (con su tabla), se suma a la
  lista de `build.py`, su caja a `preview.py`, y en `fightSprites.config.ts` la hoja (`SHEETS`),
  la tabla de poses, `MOVE_ANIM` y el dibujo del impacto. **Los once golpes tienen hoja propia**
  (`sLight`, `sSig` y `sAir` usan `light_ground`, `heavy` y `light_air`, que eran esos golpes), y
  `fightSprites.config.test.ts` exige que ninguno comparta.
- `fightSprites.config.ts` dice qué hoja y qué dibujo va en cada frame; la vista agranda con el
  zoom de la cámara y Kaplay filtra con "nearest".
- **La VRAM se mide en páginas de atlas**, no sumando PNGs: `src/games/kaplay/atlas.ts` repite el
  empaquetado de Kaplay (páginas de 2048×2048 = 16 MB cada una). `fightSprites.config.test.ts`
  exige que escenario + dos pieles entren en 2 páginas, hoy y con las hojas de los once golpes.
  Aparte, cada instancia de Kaplay tiene 16 MB de atlas de fuente.

## Medir combos: `data/combos.ts`

Herramientas de análisis, no del tick. Juegan la sim de verdad (no hay fórmulas que se olviden
de un aterrizaje o de la fricción):

- `standoff(world, key, damage)`: el 0 a punto de tirar `key` contra el 1, parado en el centro
  de la caja del golpe, en el medio del escenario (en el aire, para los aéreos).
- `opening(world, key, damage)`: `standoff`, y si desde ahí el golpe no pega (uno que baja en
  picada), el rival parado en el piso y el que pega arriba, a la menor altura que entra.
- `frameAdvantage(world, key, damage)`: ventaja en frames, distancia y altura cuando el rival
  recupera el control.
- `followsUp(world, first, second, damage)`: si `second` entra como combo real atrás de `first`
  (rival todavía en hitstun), probando ir hacia el rival y apretar en cada tick, y saltar antes
  para los aéreos.
- `inputOf` / `pressFor`: el casillero y el byte de input de cada golpe.
- Si el segundo golpe es de piso, `followsUp` también prueba llegar con **gravity cancel**
  (saltar, esquivar quieto, golpe en `dodge.attackCancelFrom`) y lo marca en `gravityCancel`.

`__tests__/combos.test.ts` tiene el control positivo de la herramienta y las invariantes de combo.
La tabla de resultados vive en `memoria.md` y se regenera en cada fase que cambia golpes.

## El bot y M6

- `RecoveryPolicy.useRecovery`: sin saltos de aire y cayendo, tira `HEAVY` hacia el escenario (el
  recovery) al pasar la altura de la política. `chooseRecovery` prueba las dos variantes.
- El bot de reglas elige la dirección por la posición del rival (neutro si está arriba, barrida
  con probabilidad `combo` del perfil, spike si está encima) y va al aire si el rival está
  aturdido arriba. El difícil tiene los golpes con dirección, la ruta de combo, el spike y el
  gravity cancel entre sus planes (`fightCandidates`).
- Tests en `bot.test.ts`: vuelve con el recovery (los tres niveles) y el medio y el difícil usan
  golpes con dirección.

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
