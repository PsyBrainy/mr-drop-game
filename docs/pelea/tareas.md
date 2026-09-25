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
- **M6 ✓** — Ataques con dirección y bases para combos (F0–F6, 2026-09-25): once golpes con
  datos, dibujo y sonido, buffer, recovery, spike, gravity cancel, el primer combo real medido
  y el bot que los usa. Quedan dos preguntas de diseño abiertas (abajo).

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
- [x] **A0 ✓ — Lugar para las animaciones** (2026-09-25). Las hojas del rasta se exportan a 1x
  (96×96) y el juego agranda con "nearest": píxel a píxel iguales a las de antes. La VRAM se mide
  como la paga Kaplay, en páginas de atlas (`src/games/kaplay/atlas.ts`): la pelea pasó de 3
  páginas (48 MB) a 2 (32 MB), y con las hojas de los once golpes sigue en 2 (con 2x hubieran
  sido 5). No cambia la sim: `SIM_VERSION` sigue en 5.
- [x] **F2 ✓ — El recovery** (2026-09-25). El fuerte en el aire (quieto o de costado) impulsa
  para arriba pegando: `motion` y `oncePerAirtime` en el frame data, `airMovesUsed` en el estado.
  La deriva bajó de 5,6 a 4,8 y hay tests de recuperación con y sin el recovery. Hoja propia
  `recovery` para las dos pieles. `SIM_VERSION` 6 (mrdrop y psy-ws).
- [x] **F3 ✓ — Piso con dirección** (2026-09-25). Datos propios para `nLight` (jab para arriba),
  `sLight` (el puño con un paso), `dLight` (barrida que levanta), `nSig` (gancho antiaéreo),
  `sSig` (la bocanada con un paso) y `dSig` (barrida larga de humo). **Primer combo real:
  `dLight → sAir` de 0 a 60 de daño**, que se corta solo a 80. Hojas nuevas: `n_light`, `d_light`,
  `n_sig`, `d_sig` (`sLight` y `sSig` se quedan con las de siempre, que eran esos golpes).
  `SIM_VERSION` 7 (mrdrop y psy-ws).
- [x] **F4 ✓ — Aire con dirección** (2026-09-25). `nAir` (patada en círculo), `sAir` (la patada
  voladora de siempre), `dAir` (**el spike**) y `groundPound` (caída en picada con `landingLag`).
  Tope propio del empuje en hitstun (`knockbackMaxSpeed`, 24) en vez de `maxFall`, y `spiked`: un
  spike que te estrella contra el piso termina el hitstun. `dLight → sAir` sigue siendo combo
  (de 0 a 40). Hojas nuevas: `n_air`, `d_air`, `ground_pound`: **los once golpes tienen dibujo
  propio**. `SIM_VERSION` 8 (mrdrop y psy-ws).
- [x] **Sonidos nuevos ✓** (2026-09-25, entre F4 y F5). Del tercer par de audios de la comunidad:
  sonido propio para `nLight`, `nAir`, `dAir`, `recovery` y `groundPound` (los dos personajes), y
  el esquive del rasta 2, que no tenía. Sin cambio de sim. Qué recorte va con qué: `memoria.md`.
- [x] **F5 ✓ — Gravity cancel** (2026-09-25). Esquive quieto en el aire → el golpe de piso, en
  el aire (`gravityCancel` en el estado, `dodge.attackCancelFrom` = 16, el primer frame después de
  la invulnerabilidad). Un golpe de piso que aterriza sigue en vez de cortarse. Sin dibujos
  nuevos: los golpes de piso se ven igual en el aire. `SIM_VERSION` 9 (mrdrop y psy-ws).
  **Pendiente:** `followsUp` todavía no prueba rutas con gravity cancel, así que las invariantes
  de combo no las cubren.
- [x] **F6 ✓ — Terminaciones** (2026-09-25). `followsUp` prueba rutas con gravity cancel (y
  tiene su control positivo); el bot usa los golpes con dirección, arranca el combo de la barrida,
  tira el spike y vuelve con el recovery; el cartel de controles explica direcciones, recovery y
  gravity cancel; contador de combo en el HUD (`fightCombo.ts`, lo deriva la vista). Sin cambio
  de sim: `SIM_VERSION` sigue en 9.
- [ ] **Queda para cuando lleguen más audios:** sonido propio para `sLight`, `dLight`, `nSig`,
  `sSig`, `dSig` y `sAir` (hoy suenan por familia).

### Invariantes que tienen que existir al cerrar M6

- ✓ Existe una ruta real a daño bajo: `dLight → sAir` a 0, 20 y 40, saltando (`combos.test.ts`).
- ✓ A 100 de daño ninguna ruta de dos golpes es real: los combos meten daño, no matan
  (`combos.test.ts`, los 121 pares).
- ✓ Ningún golpe se sigue a sí mismo con ningún daño (`combos.test.ts`).
- ✓ Nadie se queda en el aire para siempre combinando salto, esquive y golpes (`recovery.test.ts`).
- ✓ Desde lejos y abajo del borde se vuelve con el recovery y no sin él (`recovery.test.ts`).
- ✓ Recibir un golpe recarga el recovery; colgarse de la pared, no (`recovery.test.ts`).
- ✓ Un spike no mata a 0 ni a 40 de daño a quien vuelve bien; a 130 sí, desde tres lugares
  afuera del borde (`aerials.test.ts`).
- ✓ Cada golpe tiene su hoja propia: ningún `MoveKey` comparte `MOVE_ANIM` con otro
  (`fightSprites.config.test.ts`).
- ✓ Las invariantes de combo incluyen rutas con gravity cancel (`combos.test.ts`).
- ✓ Los tres niveles del bot vuelven desde donde sólo se vuelve con el recovery, y el medio y el
  difícil pelean con los golpes con dirección, barrida incluida (`bot.test.ts`).

### Preguntas abiertas

1. ¿Tres direcciones o cuatro con arriba separado? **F0 salió con tres** (ver `memoria.md`);
   pasar a cuatro después es sumar una columna a `moveFor`, no rehacer.
2. ~~"Esquivo y ataco en el aire"~~: **el gravity cancel de Brawlhalla** (decidido por Martín,
   hecho en F5).
3. ~~¿El spike rebota contra el piso?~~ No rebota: te estrella y **te levantás** (se termina el
   hitstun). Decidido en F4 porque dejarlo aturdido en el piso regalaba combos; ver `memoria.md`.
4. **¿Tiene que poder matarse por arriba?** Hoy no se puede: la zona de muerte de arriba está a
   ~820 px del piso y haría falta salir a ~37 px/frame; el techo del empuje es 24 (el gancho a
   150 de daño sube ~320 px). Las salidas son bajar `blastTop` del escenario, subir el techo, o
   dejarlo así (se mata de costado y por abajo). Es una decisión de diseño del escenario.
