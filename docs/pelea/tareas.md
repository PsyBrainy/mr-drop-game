# Pelea — estado de tareas

Qué está hecho, qué está en curso y qué falta. Se actualiza en el mismo commit que el código:
una fase se marca ✓ cuando entra con sus tests verdes. Por qué se decidió cada cosa está en
`memoria.md`; acá sólo el estado.

## Hitos

Brawlhalla son 50+ personajes con 2 armas y ~14 ataques cada una. Eso es *data*. Primero la
arquitectura, con un personaje:

- **M0 ✓** — Harness (`reglas.md` + `purity.test.ts`) y sim que tickea, con el test de replay:
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
- **M4 ✓** — Re-simulación y ranking. `src/fight/replay/validate.ts` re-juega una fila de
  `fight_matches` y da el veredicto; `validator/` es el proceso (Node, Docker, al lado de psy-ws)
  que lo corre sobre las pendientes y escribe `verdict` y `validated_winner`. El ranking es
  "ganadas / perdidas" por juego de concurso (vista `fight_leaderboard`, migración 0011): sólo
  cuentan partidas con los dos jugadores verificados, jugadas desde un concurso y confirmadas por
  el validador. Abandonar es perder, salvo que la sim diga que ya había terminado. Contra el bot
  no cuenta (es local y no pasa por el servidor).
- **M5** — Rollback, sólo si M3 se siente mal con pings reales. No antes.
- **M6** — Ataques con dirección y bases para combos. **En curso** (F0 ✓, F1 ✓, sigue A0): fases abajo.
  Va antes que M5.

## M6: ataques con dirección y bases para combos

Objetivo: que existan combos. Los golpes con dirección son el medio (ver `memoria.md`, M6).

Cada fase entra con `npm run lint && npm test`, sus invariantes, y `SIM_VERSION` +1 si cambia la
sim.

**Un golpe no está terminado sin su animación.** Cada fase que le da datos propios a un golpe le
da también, en el mismo cambio, su hoja de dibujos para las dos pieles (`tools/rasta-sprites`), su
tabla de poses con el impacto en el primer frame activo, y el alcance dibujado revisado contra la
caja con `preview.py`. El arte no se deja para el final: un golpe nuevo que se ve con el dibujo de
otro no se puede leer, y en un juego de pelea leer el golpe del rival es la mitad del juego. El
sonido sí puede seguir por familia hasta que la comunidad grabe más.

- [x] **F0 ✓ — Estructura sin cambiar el juego** (2026-09-25). `Aim`, `moveFor`, los 11 golpes
  (repiten los tres de siempre), test de tabla sobre los 256 inputs, golpe antes que bajarse de
  la flotante, vista y sonidos por familia. `SIM_VERSION` 4 (mrdrop y psy-ws). Detalle en
  `tecnica.md`, "Golpes".
- [x] **F1 ✓ — Buffer de golpe y medición** (2026-09-25). `attackBuffer` (6 frames) +
  `bufferedButton` + `bufferedAim` en el estado; `data/combos.ts` con `frameAdvantage` y
  `followsUp`; tabla regenerada en `memoria.md`. `SIM_VERSION` 5 (mrdrop y psy-ws).
- [ ] **A0 — Lugar para las animaciones.** Hoy las hojas se sirven ya escaladas 2x: 120 dibujos
  de 192×192 son ~17 MB de VRAM contra un techo de 20 (`fightSprites.config.test.ts`). Las ~8
  hojas nuevas por piel no entran. Se sirven a 1x (96×96, el arte ya se dibuja a 1 px = 1 px) y
  la vista escala 2x con filtro "nearest": el mismo pixel art nítido con un cuarto de la VRAM
  (~4 MB hoy, ~8 MB con los once golpes). Va antes de F2, que es la primera hoja nueva.
- [ ] **F2 — El recovery** (fuerte en el aire que impulsa), según lo decidido en `memoria.md`:
  `motion`, `oncePerAirtime`, `airMovesUsed`. Baja la deriva y se reescribe el test de
  recuperación. Animación: `recovery` (sube pegando para arriba).
- [ ] **F3 — Piso con dirección.** Datos propios para `nLight`, `sLight`, `dLight`, `nSig`,
  `sSig`, `dSig`, y `motion` en los que avanzan. Primera ruta de combo real con su test.
  Animaciones: las seis de piso (las tres de hoy se redibujan donde el golpe cambió).
- [ ] **F4 — Aire con dirección.** `nAir`, `sAir`, `dAir` con spike (`knockback.y > 0`),
  `groundPound`; tope de velocidad propio del hitstun en vez de `maxFall`. Animaciones: `nAir`,
  `sAir`, `dAir` y `groundPound`. El spike y la caída en picada necesitan una anticipación que se
  vea venir: son los golpes que matan fuera del escenario.
- [ ] **F5 — Esquive → golpe.** `dodge.attackCancelFrom`, después de `invulnTo`.
- [ ] **F6 — Terminaciones.** Sonidos por golpe (si hay grabaciones nuevas), el bot usando la
  dirección y el recovery, `fightHelp.ts` y el contador de combo en el HUD (lo deriva la vista, no
  la sim).

### Invariantes que tienen que existir al cerrar M6

- Existe una ruta real a daño bajo (`dLight → sAir` entre 0 y 40). *Pendiente: `it.todo` en
  `combos.test.ts`, llega con F3.*
- ✓ A 100 de daño ninguna ruta de dos golpes es real: los combos meten daño, no matan
  (`combos.test.ts`, los 121 pares).
- ✓ Ningún golpe se sigue a sí mismo con ningún daño (`combos.test.ts`).
- Nadie se queda en el aire para siempre combinando salto, esquive y golpes.
- Con saltos gastados y el recovery disponible se vuelve desde X px bajo el borde; gastado, no.
- Recibir un golpe recarga el recovery; colgarse de la pared, no.
- Un spike no mata a 0 de daño a quien vuelve bien; sí desde cierto daño bajo el borde.
- Cada golpe tiene su hoja propia: ningún `MoveKey` comparte `MOVE_ANIM` con otro, salvo los que
  son el mismo golpe (el `recovery` neutro y de costado). Hoy ese test fallaría a propósito: es la
  lista de lo que falta dibujar.

### Preguntas abiertas

1. ¿Tres direcciones o cuatro con arriba separado? **F0 salió con tres** (ver `memoria.md`);
   pasar a cuatro después es sumar una columna a `moveFor`, no rehacer.
2. "Esquivo y ataco en el aire": ¿cortar el esquive con un golpe (F5), o el gravity cancel de
   Brawlhalla (esquive quieto en el aire → golpe de piso)?
3. ¿El spike rebota contra el piso o sólo deja al rival en hitstun? (se decide en F4)
