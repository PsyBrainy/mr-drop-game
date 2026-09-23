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
- `registry.ts` pasa a entradas discriminadas (`kind: 'score' | 'match'`). Los juegos que ya
  existen no se tocan.
- El HUD de React muestra daño acumulado y stocks, no puntaje.
- El resultado va a una tabla `matches` nueva (ganador, perdedor, log de inputs, validado sí/no).
  **Prohibido** mapear una pelea a `finish_game_session(score)` para que "entre" en el ranking
  actual.

## Estructura

```
src/fight/
  sim/          simulación determinista. CERO dependencias, cero DOM, cero Kaplay.
    fixed.ts      punto fijo (enteros, 1/256 de píxel)
    rng.ts        xorshift con semilla; la semilla la fija el servidor por match
    input.ts      bitmask de 1 byte por frame + buffer
    state.ts      MatchState / FighterState (datos planos, serializables)
    physics.ts    integración, fricción piso vs aire, knockback
    collision.ts  AABB, broadphase en orden fijo
    resolve.ts    hitbox vs hurtbox, clash, prioridades
    tick.ts       step(state, inputs) -> state. El orden de fases vive acá y sólo acá.
    hash.ts       checksum del estado, para detectar desync
  data/         frame data como DATOS. Zod al cargar + tests de invariantes.
    schema.ts
    characters/*.ts
  net/          protocolo y sesión. Puerto de transporte, sin WebSocket concreto adentro.
    protocol.ts   los mensajes. Fuente única de verdad del contrato con psy-ws.
    port.ts       interface Transport
    session.ts    delay-based primero; rollback después
  replay/
    format.ts     log de inputs serializable (semilla + personajes + inputs por frame)

src/games/modules/fight.ts              la vista: Kaplay leyendo MatchState
src/infrastructure/ws/                  el adaptador que implementa Transport
```

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
4. Instanciar hitboxes según el frame data del frame actual
5. Resolver golpes en pares de orden fijo: (0 → 1), (1 → 0), y recién después el clash
6. Aplicar knockback e hitstun (el vector escala con el daño acumulado, como Brawlhalla)
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
- Cada paquete lleva los **últimos 8 frames de input**, redundantes. WebSocket es TCP: un
  paquete demorado no puede congelar la partida.
- El cliente **no manda estado, manda input.** Nunca "morí" ni "le pegué": sólo botones.
- Cada 30 frames los peers intercambian el hash del estado. **Si difiere, el match se aborta y
  se loguea.** Prohibido seguir jugando con un desync: es la diferencia entre un bug que se
  arregla en una tarde y uno que no se puede reproducir nunca.
- `protocol.ts` es la fuente única del contrato. psy-ws refleja esos mensajes y se verifica con
  fixtures JSON commiteadas en los dos repos.
- El transporte está detrás de `Transport` (`net/port.ts`). WebSocket hoy; si algún día hace
  falta UDP real (WebTransport / WebRTC DataChannel) se cambia el adaptador y la sim no se entera.

### 6. El clock de la sim es propio

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

- **M0** — Harness (este archivo + `purity.test.ts`). Sim vacía que tickea + test de replay:
  el mismo log de inputs produce el mismo hash final. Sin esto, nada de lo de abajo es medible.
- **M1** — Un personaje: movimiento, salto, plataformas. Dos jugadores en el mismo teclado.
- **M2** — Frame data + 3 ataques (light terrestre, light aéreo, uno fuerte), hitstun, knockback
  escalado por daño, ring-out, stocks.
- **M3** — Red: rooms y relay en psy-ws, delay-based, dos navegadores, hash de desync.
- **M4** — Re-simulación headless en Node + tabla `matches` + ranking.
- **M5** — Rollback, sólo si M3 se siente mal con pings reales. No antes.

## Cómo trabajar acá

- Un bug de gameplay se reporta con un **archivo de replay**, no con una descripción. Si no hay
  replay, el primer paso es conseguirlo.
- Todo cambio de balance o de física entra con su test de invariante. Un número sin test no entra.
- Si algo obliga a violar una regla de arriba: se discute y se cambia la regla en este archivo.
  No se hace la excepción en silencio.
