# Pelea — memoria

Lo que se decidió, por qué, y lo que se midió. Es un registro: lo nuevo se agrega arriba de lo
viejo, y lo que se revierte no se borra, se tacha y se anota quién lo reemplazó. El estado de
cada tarea está en `tareas.md`; las reglas que salen de acá, en `reglas.md`.

## M6 — ataques con dirección y bases para combos (2026-09-25)

Pedido de Martín: que los golpes tengan dirección como en Brawlhalla (el golpe depende de botón,
dirección y piso/aire; un golpe para abajo en el aire tira al que está en el borde) y, sobre
todo, **sentar las bases para los combos**. Un combo es una ruta ("el bajo lo levanta, el aéreo lo
agarra arriba") y sólo existe si cada golpe manda al rival para un lado distinto y te deja actuar
antes que él.

### Punto de partida: no hay combos (medido con la sim, SIM_VERSION 3)

Ventaja = frames que el que pegó recupera el control antes que el rival, pegando en el primer
frame activo. Distancia = centro a centro cuando el rival sale del hitstun.

| Golpe | Daño previo | Ventaja | Distancia |
| --- | --- | --- | --- |
| liviano de piso | 0 / 50 / 100 | +2 / +3 / +3 | 75 / 92 / 105 px |
| fuerte | 0 / 50 / 100 | +1 / +5 / +9 | 185 / 290 / 432 px |

El liviano alcanza ~60 px y sale en 4 frames; el esquive del rival cubre desde su frame 3. **Hoy
no existe ningún combo real.** Además, lo que traba:

1. Tres golpes fijos (`lightGround`, `lightAir`, `heavy`); la dirección sólo gira al personaje.
2. El fuerte es el mismo en el piso y en el aire.
3. Todos los empujes van hacia adelante y arriba: no hay spike.
4. **Un golpe apretado durante el recovery se pierde** (no hay buffer, como sí lo hay para el
   salto). Encadenar exige clavar el frame.
5. Abajo + golpe arriba de una flotante te baja en vez de pegar: bajarse se evalúa antes.
6. `maxFall` también recorta la velocidad vertical del knockback: el empuje vertical se satura
   en 16 px/frame para los dos lados.
7. El esquive no se puede cortar con un golpe.
8. En hitstun sobre el piso no hay fricción: el rival se desliza todo el hitstun.

`UP` y `DOWN` ya están en el byte de input: **agregar dirección no cambia el protocolo ni
`protocol.fixtures.json`**, sólo lo que la sim hace con esos bits.

### Decidido el 2026-09-25

- **El golpe fuerte en el aire impulsa, como en Brawlhalla** (el `recovery`). Por ahora **sólo el
  fuerte**; los livianos aéreos no frenan la caída.
  - El impulso **reemplaza** `vy`, no se suma: es lo que hace que sirva cayendo (igual que
    `airJumpVelocity` hoy). Arranque a ajustar con tests: `vy ≈ -13` en el frame 3 del golpe,
    con caja arriba del personaje; el salto sube ~100 px y el de aire ~80.
  - Va en el frame data como `motion: { frame, vx?, vy }`, aplicado en la fase 2 del tick cuando
    `stateFrames === motion.frame`. Es un dato del reloj del ataque, como la caja.
  - **Una vez por vuelo** (`oncePerAirtime` en el golpe, `airMovesUsed` en el estado, entra al
    hash). Se recarga al aterrizar y al recibir un golpe; **no** al colgarse de la pared (el
    salto de pared ya es su recurso y sumados serían trepar gratis).
  - Gastado, fuerte en el aire (sin apuntar abajo) **no hace nada**: peor que no salir nada es
    que salga un golpe que no se pidió.
  - Aterrizar en medio aplica el `landLag` de siempre.
  - La deriva de `oso.ts` está inflada *porque* no había recuperación: baja, y el test de
    recuperación se reescribe — se vuelve **con** el recovery y **no sin** él.
- El recovery se adelanta: es la fase F2, no la última.
- El contador de combo es de la vista (golpe que entra con el rival en hitstun), no de la sim.
- Golpe gana sobre bajarse de la flotante.

### El modelo de golpes: tres direcciones (asumido para arrancar F0)

Martín pidió arrancar sin esperar la respuesta, así que F0 va con **tres direcciones**: arriba cuenta como neutro (como Brawlhalla): `W` sigue siendo salto y no hay
que separar apuntar de saltar en teclado, mando ni pantalla. `DOWN` gana sobre el costado.
Una función pura `moveFor(grounded, button, aimOf(input))` elige el golpe; un test recorre los 256
valores del byte y verifica que cada uno da exactamente uno.

| | Neutro (nada / arriba) | Costado | Abajo |
| --- | --- | --- | --- |
| Liviano, piso | `nLight` levanta un poco | `sLight` avanza, empuja horizontal | `dLight` barrida que levanta en diagonal: arranca combos |
| Fuerte, piso | `nSig` antiaéreo | `sSig` el que mata de costado | `dSig` caja larga y baja |
| Liviano, aire | `nAir` malabarea arriba | `sAir` persecución | `dAir` **spike**: `knockback.y > 0` |
| Fuerte, aire | `recovery` | `recovery` | `groundPound` cae en picada, castigo largo |

Once golpes. `MoveSet` los exige todos (Zod); dos entradas pueden ser el mismo objeto, escrito.
Además: `attackBuffer` + `bufferedMove` en el estado (como `jumpBuffer`), cortar el esquive con un
golpe desde `dodge.attackCancelFrom` (después de `invulnTo`), y un tope de velocidad propio para
el hitstun en vez de `maxFall`.

### F0 hecha (2026-09-25) — SIM_VERSION 4

- Los 11 golpes existen y la tabla decide cuál sale; los datos son los tres de siempre, así que
  se juega igual salvo por una cosa: **abajo + golpe arriba de una flotante ahora pega**.
- Se subió `SIM_VERSION` aunque el hash de la partida de ejemplo no cambió: el estado guarda la
  clave nueva del golpe (`lightAir` era el código 2, `nAir` es el 7), así que un v3 contra un v4
  se desincronizaría apenas alguien pegue en el aire.
- Los nombres de los golpes son los de la comunidad de Brawlhalla (`nLight`, `sSig`, `dAir`…)
  para poder buscar cómo lo resuelve ese juego.
- `IMPACT_POSE` y las poses siguen por familia de dibujo (rápido de piso, rápido aéreo, fuerte).

### Cómo se documenta (2026-09-25)

La pelea se documenta en `docs/pelea/` partido por propósito: índice (`README.md`), reglas,
memoria, tareas, funcional y técnica. `mrdrop/CLAUDE.md` importa reglas y tareas. Antes estaba
todo en `CLAUDE.md`, y ya había quedado desactualizado en dos lugares (los controles del modo
local y "no rankea hasta M4").

### Encontrado al documentar (2026-09-25)

- El comentario de `DodgeTuning.speed` dice que en el piso el esquive es en el lugar, pero
  `startDodge` le da velocidad con la dirección también en el piso (y durante el esquive no hay
  fricción): con dirección, el esquive de piso te desplaza. `funcional.md` describe lo que hace
  el código. Falta decidir cuál de los dos es el correcto.

## Antes de M6

Decisiones que ya venían del armado del juego (el detalle está en `tecnica.md` y `reglas.md`):

- **Sim compartida + relay, no servidor autoritativo en vivo** (M0): un solo motor en TS,
  determinista, re-simulado por el validador para el ranking.
- **Delay-based antes que rollback** (M3): el rollback (M5) sólo si con pings reales se siente mal.
- **`MatchModule` postergado** (M3): no compraba nada hasta que el resultado se guardara.
- **Movimiento de recuperación aérea afuera de M2**: cambiaba el ajuste de la deriva verificado
  por el test de recuperación. Por eso la deriva de `oso.ts` quedó inflada. ~~Queda para después~~
  → se hace en M6 F2.
- `SIM_VERSION` 2: el salto de pared sale más para arriba (jumpX 6 → 3, jumpY -11 → -13), porque
  desde la mitad del canto no se podía volver jugando perfecto.
- `SIM_VERSION` 3: plataformas flotantes que se mueven; el estado suma `platform` y
  `dropThrough`, y abajo sirve para bajarse de ellas.
