# MrDrop — reglas de trabajo

Web de concursos de la comunidad MrDrop (Vite + React 19 + TS, Supabase, juegos en Kaplay).
Arquitectura hexagonal: `domain` (0 deps) → `application` (puertos + casos de uso) →
`infrastructure` (adaptadores). La UI consume casos de uso, nunca repositorios.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Dev server (`dev:host` para probar desde el celular) |
| `npm run lint` | Typecheck (`tsc -b --noEmit`) |
| `npm test` | Vitest |
| `npm run test:db` | Todas las migraciones + `supabase/tests/*.test.sql` en un Postgres 16 descartable (Docker, o `DB_TEST_URL`) |

Antes de entregar cualquier cambio: `npm run lint && npm test`. Los dos, siempre. Si se tocó una
migración, también `npm run test:db`.

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
  SQL Editor. No hay CLI de Supabase en este flujo. Idempotentes, y un valor nuevo de enum va en
  su propia migración (el Editor corre todo en una transacción y Postgres no deja usar el valor
  en la misma). `scripts/db-test.sh` corre cada una en su transacción, igual que el Editor.
- **Una regla de la base se prueba en la base.** RLS y funciones `SECURITY DEFINER` se prueban
  con un escenario en `supabase/tests/*.test.sql` que "es" cada actor
  (`set request.jwt.claim.sub`) y verifica lo que le deja y lo que no. Un mock de Supabase en
  Vitest no prueba RLS.

---

# Juego de pelea (`src/fight`) — el harness

Juego 1v1 online tipo Brawlhalla. La documentación vive en **`docs/pelea/`**, un archivo por
propósito; el índice es `docs/pelea/README.md`:

| Archivo | Qué tiene |
| --- | --- |
| `reglas.md` | Reglas duras y cómo se trabaja. Importado abajo: siempre cargado |
| `tareas.md` | Estado de hitos y fases. Importado abajo: siempre cargado |
| `memoria.md` | Decisiones con su porqué, y mediciones. Registro con fechas |
| `funcional.md` | Cómo se juega |
| `tecnica.md` | Cómo está hecho: red, estructura, cómo probar, de input a golpe |

**Todo avance de la pelea se documenta ahí, en el mismo commit que el código.**

@docs/pelea/reglas.md

@docs/pelea/tareas.md

---

# Analytics (Google Analytics 4)

`src/infrastructure/analytics/` — gtag.js armado a mano. El id sale de `VITE_GA_MEASUREMENT_ID`
(sin la variable no se carga nada) y `VITE_GA_DEBUG=true` manda todo a DebugView.

- **Páginas:** `ui/analytics/AnalyticsTracker.tsx` manda `page_view` en cada cambio de ruta (es
  una SPA; la página vista automática de GA está apagada para no contar dos veces). El título
  sale de `pageName.ts`.
- **Automático:** `autoTrack.ts` manda `ui_click` (todo botón y link), `form_submit` y `exception`
  (errores de JS). `data-analytics="nombre"` renombra, `data-analytics="off"` apaga.
- **Del negocio:** login/sign_up/logout, join_group (canje de código), game_start / game_end /
  post_score, fight_* (cola, rival encontrado, bot, final, controles, mando), comercio
  (view_item_list, add_to_cart, remove_from_cart, purchase, order_update, order_cancel).
- **Prohibido mandar datos personales** (lo prohíbe Google): nada de mails, nombres, direcciones.
  El usuario va por `user_id` = id de Supabase. Los links se describen por su ruta, no por su
  texto (el de "Mi cuenta" es el nombre de la persona). Los códigos de acceso y tokens se tapan
  de las URLs (`safePath`).


---

# Reparto (app de repartidores)

La app Android de repartidores toma pedidos, cambia su estado y reporta la posición; el admin
ve todo en el panel. Decisiones cerradas; si alguna se reabre, se actualiza esto en el mismo
commit.

```
app repartidor ──WS──┐                  ┌──WS── panel admin (web)
                     ▼                  ▼
                psy-ws /ws/delivery  (relé en tiempo real)
                     │  ▲
   funciones SQL     │  │  LISTEN / NOTIFY delivery
   COMO el usuario   ▼  │
                Postgres (reglas: 0013)
```

- **La base decide; psy-ws reparte.** Las reglas son las funciones y el RLS de 0013. psy-ws las
  llama haciéndose pasar por el usuario (`set local role authenticated` + el `sub` del token), así
  que decide lo mismo que si la app hablara directo con la base. El módulo y sus reglas están en
  `psy-ws/CLAUDE.md`, sección "Reparto".
- **Nada de Supabase Realtime** (costo, y no atarse a Supabase). Los triggers hacen
  `pg_notify('delivery', …)` con ids y estados, nunca direcciones; psy-ws escucha y avisa a quien
  corresponda. 0013 además saca `orders` y `courier_presence` de la publicación de Realtime si
  estaban.
- **La app no usa la API de Supabase para el reparto**: sólo Supabase Auth para el login (el
  token) y después todo por `/ws/delivery`. Lo único atado a Supabase es la identidad y dónde
  vive Postgres.

## La base decide, la app pide

El repartidor **no tiene policy de update** sobre `orders`. Todo pasa por funciones de
`0013_delivery_tracking.sql` que validan quién, qué y desde dónde:

| Función | Quién | Qué |
| --- | --- | --- |
| `start_shift()` / `end_shift()` | repartidor | Turno. Cortarlo borra la posición |
| `report_position(lat, lng, …)` | repartidor en turno | Última posición. Una más vieja que la guardada se ignora |
| `claim_order(id)` | repartidor en turno | Toma de la bolsa. `for update`: dos no toman el mismo |
| `courier_update_order(id, estado)` | el repartidor que lo tiene | Mueve según el contrato |
| `assign_order(id, courier \| null)` | admin | Asigna, reasigna o devuelve a la bolsa |

El admin sigue corrigiendo estados con update directo desde el panel. Lo que se deriva del
estado (`delivered_at`, `status_changed_at`, soltar `courier_id` al volver a la bolsa) y el
historial en `order_events` lo resuelven **triggers**, así ningún camino se olvida de hacerlo.

## El flujo

```
pending ──claim_order / assign_order──> assigned ──> on_the_way ──> delivered
   ▲                                       │                  └──> failed
   └──────────── lo suelta ────────────────┘
```

- Se reparte **con la camada cerrada**. Mientras está abierta el usuario puede rearmar o
  cancelar; la bolsa del repartidor está vacía y `claim_order` responde `ROUND_STILL_OPEN`.
- El repartidor no cancela ni toca lo terminado. `failed` lo resuelve el admin (reasignar o
  volver a la bolsa).
- `assigned` y `on_the_way` exigen `courier_id` (check de la tabla, no de la app).

**El contrato** es `src/domain/order/orderFlow.contract.json` (estados, transiciones, RPCs y
códigos de error), commiteado también en la app. `OrderFlow.ts` es el espejo en el dominio.
`courierFlow.test.ts` cruza contrato ↔ dominio ↔ migraciones (lee el bloque
`-- contrato:inicio/fin` de 0013 y los `add value` del enum): cambiar uno solo rompe el test.

## El panel en vivo (`/admin/reparto`)

```
domain/delivery/LiveDelivery.ts        estado + reduceLive() (pura) + agrupado y "sin señal"
application/ports/DeliveryChannel.ts   el puerto del canal (comandos, mensajes, estado)
application/usecases/DeliveryConsole   estado de la pantalla y comandos (assign), para useSyncExternalStore
infrastructure/delivery/               DeliverySocket (WebSocket con reconexión), protocol.ts (zod)
                                       y la copia de delivery-protocol.fixtures.json
ui/pages/admin/DeliveryLivePage.tsx    mapa, repartidores, pedidos por estado, selector de repartidor
```

- **No usa Supabase para esto**: todo por `/ws/delivery` (URL: `VITE_DELIVERY_WS_URL`, o derivada
  de `VITE_FIGHT_WS_URL`). El token es el mismo JWT de la sesión.
- La lista cambia por el aviso, no por el `ack`, igual que en la app.
- "En camino" no se reasigna desde acá (la base lo rechaza): sacárselo a alguien que ya salió es
  una corrección, y va por la página de Pedidos.
- El mapa encuadra una sola vez: cada posición nueva no puede mover el mapa bajo el mouse.
- El nombre del repartidor en el mapa se pinta con `textContent`, nunca como HTML.
- `liveDelivery.test.ts` (reducer), `deliveryConsole.test.ts` (comandos con un canal de mentira) y
  `infrastructure/delivery/__tests__/protocol.test.ts` (contrato del cable).

## Ubicación

- **Solo en turno.** `courier_presence` tiene un check: fuera de turno no hay lat/lng.
- **Última posición, no recorrido.** `order_events` guarda dónde estaba el repartidor *al
  cambiar el estado* (si reportó en los últimos 2 minutos), nada más.
- El cliente no ve `order_events` ni `courier_presence`. Ver "tu pedido en camino" en un mapa
  es una decisión aparte, no un efecto de agregar una policy.
- Las posiciones van del celular a psy-ws, que las pasa al panel en vivo y las guarda en
  `courier_presence` cada 30 s (no cada lectura de GPS: eso es lo caro).

## Plan

- **M0 ✓** — Esquema (0012 + 0013) con NOTIFY, dominio y contrato con tests, escenarios de RLS en
  `supabase/tests/delivery.test.sql`, compatibilidad del panel con los estados nuevos. En
  psy-ws, el módulo `delivery/` con `/ws/delivery`, la escucha de NOTIFY y el tablero de
  posiciones; el cable está en `delivery-protocol.fixtures.json`.
- **M1 ✓** — App (`mrdropcourierapp/`): login, turno, bolsa y mis pedidos, detalle, Waze, estados.
  Panel: `/admin/reparto` asigna y muestra quién lleva cada pedido, en vivo.
- **M2 ✓** — La app comparte la ubicación en turno (foreground service); el panel la muestra en
  el mapa de `/admin/reparto`.
- **M3** — "En camino" para el cliente, push al asignar, cola offline de cambios de estado.
