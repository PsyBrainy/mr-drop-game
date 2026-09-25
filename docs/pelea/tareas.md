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
- **M6** — Ataques con dirección y bases para combos. **En curso** (F0 ✓, sigue F1): fases abajo.
  Va antes que M5.

## M6: ataques con dirección y bases para combos

Objetivo: que existan combos. Los golpes con dirección son el medio (ver `memoria.md`, M6).

Cada fase entra con `npm run lint && npm test`, sus invariantes, y `SIM_VERSION` +1 si cambia la
sim.

- [x] **F0 ✓ — Estructura sin cambiar el juego** (2026-09-25). `Aim`, `moveFor`, los 11 golpes
  (repiten los tres de siempre), test de tabla sobre los 256 inputs, golpe antes que bajarse de
  la flotante, vista y sonidos por familia. `SIM_VERSION` 4 (mrdrop y psy-ws). Detalle en
  `tecnica.md`, "Golpes".
- [ ] **F1 — Buffer de golpe y medición.** `attackBuffer` + `bufferedMove` en el estado (como
  `jumpBuffer`); en `data/fighter.ts`, `frameAdvantage(tuning, move, damage)` y
  `followsUp(tuning, a, b, damage)`; la tabla de ventaja de `memoria.md` regenerada con eso.
- [ ] **F2 — El recovery** (fuerte en el aire que impulsa), según lo decidido en `memoria.md`:
  `motion`, `oncePerAirtime`, `airMovesUsed`. Baja la deriva y se reescribe el test de
  recuperación.
- [ ] **F3 — Piso con dirección.** Datos propios para `nLight`, `sLight`, `dLight`, `nSig`,
  `sSig`, `dSig`, y `motion` en los que avanzan. Primera ruta de combo real con su test.
- [ ] **F4 — Aire con dirección.** `nAir`, `sAir`, `dAir` con spike (`knockback.y > 0`),
  `groundPound`; tope de velocidad propio del hitstun en vez de `maxFall`.
- [ ] **F5 — Esquive → golpe.** `dodge.attackCancelFrom`, después de `invulnTo`.
- [ ] **F6 — Contenido.** Dibujos por golpe (`tools/rasta-sprites`), sonidos, bot, `fightHelp.ts`
  y el contador de combo en el HUD (lo deriva la vista, no la sim).

### Invariantes que tienen que existir al cerrar M6

- Existe una ruta real a daño bajo (`dLight → sAir` entre 0 y 40).
- A 100 de daño ninguna ruta de dos golpes es real: los combos meten daño, no matan.
- Ningún golpe se sigue a sí mismo (sin loops infinitos).
- Nadie se queda en el aire para siempre combinando salto, esquive y golpes.
- Con saltos gastados y el recovery disponible se vuelve desde X px bajo el borde; gastado, no.
- Recibir un golpe recarga el recovery; colgarse de la pared, no.
- Un spike no mata a 0 de daño a quien vuelve bien; sí desde cierto daño bajo el borde.

### Preguntas abiertas

1. ¿Tres direcciones o cuatro con arriba separado? **F0 salió con tres** (ver `memoria.md`);
   pasar a cuatro después es sumar una columna a `moveFor`, no rehacer.
2. "Esquivo y ataco en el aire": ¿cortar el esquive con un golpe (F5), o el gravity cancel de
   Brawlhalla (esquive quieto en el aire → golpe de piso)?
3. ¿El spike rebota contra el piso o sólo deja al rival en hitstun? (se decide en F4)
