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

### F1 hecha (2026-09-25) — SIM_VERSION 5

- **Buffer de golpe de 6 frames** (100 ms). Alcanza para apretar el segundo golpe mirando
  terminar el primero; con más de ~10 el personaje empieza a hacer cosas que uno ya no quería.
- Se guarda **el botón y la dirección del momento en que se apretó**; si sale de piso o de aire
  se decide cuando sale. Tocar abajo + rápido y soltar abajo enseguida da el golpe bajo igual.
- **Recibir un golpe borra el buffer**: lo pedido antes del golpe ya no vale al salir del hitstun.
- Apretar los dos botones en el mismo frame: gana el rápido, como antes.
- **Qué es un combo real** (`data/combos.ts`, definición de Brawlhalla): el segundo golpe entra con
  el rival todavía en hitstun, con al menos 2 frames de hitstun al empezar el tick. Con 1, el rival
  lo termina en la fase de timers y ya tiene la fase de input para esquivar.
- La medición se hace **jugando la sim**, no con fórmulas: la ventaja es el primer tick en que un
  golpe nuevo del que pegó arranca contra el primero en que un esquive del rival arranca. Los dos
  se paran en el medio del escenario, donde no hay flotantes abajo (con los aéreos, aterrizar en
  una flotante cambiaba la medida: el `nAir` daba +7 y era sólo porque el rival aterrizaba).
- `followsUp` prueba ir hacia el rival y apretar en cada tick posible, y para los aéreos saltar
  antes en cada tick posible. Tiene su control positivo en el test (un rápido que aturde 60 frames
  sin empujar tiene que dar combo, con y sin salto), así que "no hay combo" es un resultado y no
  un error de la herramienta.

#### Ventaja medida con `data/combos.ts` (SIM_VERSION 5, datos de F0)

Ventaja / distancia horizontal / altura del rival sobre el que pegó, cuando el rival puede actuar.

| Golpe | 0 de daño | 50 | 100 |
| --- | --- | --- | --- |
| rápido de piso (`nLight`, `sLight`, `dLight`) | +1 / 63 px / 0 | +2 / 80 px / 0 | +2 / 93 px / 0 |
| fuerte de piso (`nSig`, `sSig`, `dSig`) | +0 / 181 px / 0 | +4 / 286 px / 0 | +8 / 428 px / -9 |
| rápido aéreo (`nAir`, `sAir`, `dAir`) | +0 / 75 px / 63 | +2 / 103 px / 56 | +3 / 129 px / 90 |
| fuerte aéreo (`recovery`, `groundPound`) | +17 / 177 px / 90 | +21 / 286 px / 81 | +25 / 428 px / 69 |

(Tabla de F1. Desde F2 el `recovery` tiene datos propios: ver la entrada de F2.)

**Combos reales: 0 de 121 pares, a 0, 20, 40 y 100 de daño.** Con el buffer la mano ya no es el
problema: lo que falta son golpes que dejen al rival cerca y arriba, y eso es F3. (El +1 del rápido
contra el +2 que se midió a mano antes es la definición: ahora cuenta el primer frame en que el
esquive del rival *arranca*.)

### Quinto audio (2026-09-25) — sin cambio de sim: los once golpes con sonido propio

Audio de las 13:21:05, 12,6 s, con cuatro tramos de voz separados por silencios. Martín avisó
que en algún lado dice **"mirá que te voy a cobrar, psy"** y que eso tenía que ser un golpe o el
sonido de cuando alguien se cae. **Tampoco se pudo escuchar**; la frase se ubicó por forma: es el
único tramo de largo compatible con nueve sílabas (1,06–2,80 s) que termina en una fricativa
larga seguida de una vocal ("…psy"). Los otros dos tramos largos (6,4–8,4 s y 9,8–12,5 s) son
habla corrida, demasiado largos para un golpe, y no se usaron.

| Recorte | De dónde | Cómo es | Va en |
| --- | --- | --- | --- |
| `frase_cobrar` | 1,03–2,82 s | La frase ("mirá que te voy a cobrar, psy") | **Perder una vida**: el rasta 2 (no tenía) y el rasta 1 turnándola con la suya |
| `golpe_humo` | 3,35–3,76 s | Onomatopeya: golpe de voz y siseo largo | `dSig`, la barrida de humo |
| `golpe_barrida` | 3,87–4,21 s | Onomatopeya: golpe y siseo corto | `dLight`, la barrida |
| `golpe_patada` | 4,29–4,62 s | Onomatopeya: golpe fuerte y siseo | `sAir`, la patada voladora |
| `golpe_gancho` | 8,57–9,03 s | Un golpe seco y fuerte, suelto | `nSig`, el gancho |

- Con esto **los once golpes tienen sonido propio** y hay un test que lo exige (las familias
  quedan como respaldo para un personaje futuro al que le falten).
- `golpe_humo` salía muy bajo (pico a -12 dB) y se subió 10 dB como los demás; tiene un piso de
  ruido apenas más alto, conviene escucharlo.

### Cuarto audio (2026-09-25) — sin cambio de sim

Un audio más de la comunidad (13:19:00, 2,45 s). Tiene un golpecito de micrófono al principio
(0,37 s, afuera) y después una frase de tres sílabas seguidas, de 0,66 a 1,82 s: la primera se
separa limpia (hay un valle en 0,97 s); la segunda y la tercera van pegadas. **Tampoco se pudo
escuchar**: la asignación sale de la envolvente y el espectrograma.

| Recorte | De dónde | Va en |
| --- | --- | --- |
| `golpe_bocanada` | 0,64–1,83 s, la frase entera | `sSig`, la bocanada: el golpe que mata merece la frase |
| `golpe_puno` | 0,64–0,98 s, la primera sílaba | `sLight`, el puño de costado |

Mismo tratamiento que los anteriores: pico a -2 dB, fundido de entrada de 4 ms y de salida
proporcional. Los comparten los dos personajes. Con esto la bocanada deja de sonar con el
"fuerte" de cada personaje (que sigue en el gancho y la barrida de humo).

### F6 hecha (2026-09-25) — sin cambio de sim. M6 cerrado

- **`followsUp` con gravity cancel**: si el segundo golpe es de piso, prueba saltar (o no, si ya
  está en el aire), esquivar quieto y tirarlo en el frame 16 del esquive. Resultado con el Oso:
  **ningún combo real nuevo** a ningún daño; el gravity cancel tarda 16 frames en habilitarse y
  ningún golpe aturde tanto. Sirve para pegar arriba y para mezclar, no para combos, y las
  invariantes ahora lo cubren. Tiene su control positivo (dos personajes flotando con gravedad
  0,1 y un aéreo que aturde 50 frames: sólo se llega con gravity cancel, y la herramienta lo ve).
- **El bot**:
  - Volver: las formas de volver tienen una variante que tira el recovery (fuerte hacia el
    escenario) cuando se quedó sin saltos. Los tres niveles vuelven desde 230 px afuera y 200 por
    debajo del piso, donde sin recovery no se vuelve.
  - Fácil y medio (reglas): pegan con la dirección de dónde está el rival (neutro si está
    arriba), arrancan el combo con la barrida (15 % el fácil, 40 % el medio, cuando el rival está
    en el piso y con menos de 40 de daño), van a buscarlo al aire siempre que esté aturdido, y
    tiran el spike si caen encima.
  - Difícil (mira para adelante): suma a sus opciones los neutros, las barridas, la ruta de combo
    entera (barrida, salto, patada), el spike, el aéreo neutro y el gravity cancel, y elige con la
    sim como siempre.
  - Golpes que tiró cada uno en dos partidas de 2 minutos: fácil 5 distintos (casi todo puño y
    bocanada), medio 5 (con barridas y spikes), difícil 11 de 11. Los tests de siempre siguen
    pasando: cada nivel le gana al anterior y ninguno se cae solo.
- **El cartel de controles** explica que cada dirección es otro golpe, el recovery y el gravity
  cancel, y el consejo de abajo es la ruta del combo. Se probó en el navegador: entra sin tapar
  el HUD de arriba.
- **Contador de combo**: "3 golpes" debajo del panel del que los mete, en amarillo y con un
  saltito por golpe. Lo deriva la vista comparando un tick con el siguiente (`fightCombo.ts`),
  con la misma definición de combo real que `data/combos.ts`; queda 40 ticks a la vista después
  de cortarse. No entra a la sim ni al hash.

### F5 hecha (2026-09-25) — SIM_VERSION 9: gravity cancel

Martín eligió el gravity cancel de Brawlhalla para "esquivo y ataco en el aire" (y no cortar
cualquier esquive con un golpe).

- **Qué es**: esquivar quieto en el aire (sin dirección) y, durante ese esquive, apretar un golpe:
  sale el golpe **de piso** (con su dirección: rápido quieto es el jab, abajo la barrida, fuerte
  el gancho…) aunque estés en el aire.
- **Desde el frame 16 del esquive** (`dodge.attackCancelFrom`), el primero sin invulnerabilidad.
  En Brawlhalla se puede antes, pero acá ya estaba decidido que esquivar y pegar a la vez no puede
  ser gratis. Apretado antes, el buffer lo guarda y sale en el 16.
- **Sólo el esquive quieto en el aire.** Con dirección, o en el piso, el esquive no se corta.
  Cuesta un salto de aire, como cualquier esquive en el aire: no se puede encadenar sin fin.
- **La gravedad sigue actuando** durante el golpe (el nombre viene de cancelar el estado de
  "aire", no la gravedad). Quedarse flotando mientras se pega sería otra herramienta de
  recuperación, y la recuperación ya está ajustada con el recovery.
- **Un golpe de piso que toca el piso sigue** en vez de cortarse con castigo; eso queda para los
  aéreos. Para eso el tick pregunta si el golpe es de la tabla del aire (`isAerialMove`).
- Los pasos de `sLight` y `sSig` eran `vy: 0`, que tirados en el aire frenaban la caída en seco.
  `motion.vy` pasó a ser opcional y esos dos sólo mueven en horizontal.
- **Pendiente**: `followsUp` no prueba rutas con gravity cancel, así que "ningún combo a 100" no
  las cubre todavía. Va en F6 junto con el bot.

### Sonidos nuevos (2026-09-25) — sin cambio de sim

La comunidad mandó dos audios más de WhatsApp. Se recortaron por silencios (`silencedetect` a
-35 dB) y se normalizaron al pico de los de antes (-2 dB; el soplido del esquive al de
`rasta_dodge`, -9,6 dB). **No se pudieron escuchar**: la asignación sale de la forma de onda y el
espectrograma (duración, ataque, si hay voz o es aire), así que conviene escucharlos y
reasignar si alguno no cuadra (es cambiar un nombre en `fightSounds.ts`).

| Recorte | De dónde | Cómo es | Va en |
| --- | --- | --- | --- |
| `golpe_recovery` | audio de las 12:28:10, 0,53–1,03 s | Grito fuerte con voz sostenida | El recovery (sube gritando) |
| `golpe_jab` | idem, 1,20–1,40 s | Chasquido corto y seco | `nLight` (el jab) |
| `rasta2_dodge` | idem, 2,08–2,57 s | Tres soplidos suaves, sin voz | El esquive del rasta 2 |
| `golpe_pisoton` | idem, 2,91–3,23 s | "¡Ha!" corto y fuerte | `dAir` (el spike) |
| `golpe_patada_circulo` | idem, 3,29–3,56 s | Exhalación con voz, media | `nAir` |
| `golpe_picada` | audio de las 12:28:36, 0,38–1,30 s | Voz larga, en varios golpes | `groundPound` (la caída en picada) |

- Es otra voz que la de cada personaje (tono de ~300 Hz; los del rasta 2 andan en ~200-230), así
  que **los golpes nuevos los comparten los dos**: son el sonido del golpe, no del que lo tira. El
  soplido del esquive no tiene voz, así que va sólo para el rasta 2, que no tenía.
- `MOVE_SOUND` pasó a ser una lista por golpe: el sonido propio primero y el de la familia
  después. Hay un test que exige que todos los golpes suenen en los dos personajes.

### F4 hecha (2026-09-25) — SIM_VERSION 8

- **El spike (`dAir`)**, el pedido original: pegarle para abajo en el aire al que está por caerse
  en el borde. Salió de una búsqueda contra un rival afuera del escenario que vuelve jugando bien
  (saltos espaciados, pared, recovery), desde tres lugares (30 px afuera a la altura del piso,
  30 afuera y 60 abajo, 60 afuera y 40 abajo). Con empuje 7 y hitstun 14 **mataba a 0 de daño**:
  inaceptable. Elegido **empuje 4, hitstun 10, escalado 26** (el más alto del personaje): se
  sobrevive hasta 60 y se muere desde 80-100. De las 36 combinaciones probadas, las de escalado
  bajo nunca mataban y las de empuje 5 mataban desde 60.
- **El techo del empuje** (hallazgo 6): `maxFall` recortaba la velocidad vertical en hitstun a 16
  px/frame. Ahora hay `knockbackMaxSpeed` = 24. Efecto colateral: la barrida levantaba tanto que
  el combo se cortaba a 20; se rehízo la búsqueda de F3 y el escalado de `dLight` bajó de 10 a 6
  (24 de 144 combinaciones cumplían todo; se eligió la que menos cambiaba). El combo entra de 0 a
  40 y se corta a 60.
- **El spike sobre el escenario regalaba combos**: el rival caía al piso todavía aturdido y
  cualquier golpe de piso le entraba (combo real hasta con 100 de daño). Primero se probó
  terminar el hitstun al aterrizar rápido (`slamSpeed`), pero también le sacaba el hitstun a la
  barrida de humo con mucho daño, que dejó de matar. Decidido: **`spiked` en el estado**, que
  marca que el último golpe empujaba para abajo; si ese golpe te estrella contra el piso, te
  levantás. No rebota (la pregunta 3).
- **La caída en picada**: en el frame 4 baja a 14 px/frame, pega abajo 12 frames, y tocar el piso
  con el golpe andando son 18 frames sin control (`landingLag`, nuevo en el frame data: el resto
  de los golpes siguen con los 3 de `landFrames`).
- La herramienta de combos aprendió a medir un golpe que baja (`opening`): si no pega al rival que
  está a su altura, lo prueba con el rival parado en el piso y el que pega arriba.
- **Hallazgo: por arriba no se puede matar.** La zona de muerte está a ~820 px del piso; haría
  falta salir a ~37 px/frame y el techo es 24. Queda como pregunta abierta en `tareas.md`.
- Ventaja con los datos de F4 (0 / 50 / 100 de daño): `nAir` +2 / +3 / +5 (el rival 80-130 px
  arriba), `sAir` +0 / +2 / +3, `dAir` -2 / -4 / -6 (castigable si pega en el escenario: es para
  afuera), `groundPound` +3 / +6 / +8 (manda a 90-190 px), `dLight` +12 / +14 / +17.
- **Los once golpes tienen hoja propia** (`n_air`, `d_air`, `ground_pound` nuevas; `sAir` se queda
  con `light_air`, que era esa patada). Hay un test que lo exige. Siguen entrando en 2 páginas.

### F3 hecha (2026-09-25) — SIM_VERSION 7

- **Cada dirección tiene un trabajo**: neutro para arriba (jab `nLight`, gancho antiaéreo
  `nSig`), costado para adelante (el puño y la bocanada de siempre, ahora con un paso: `sLight`
  sale a 3 px/frame en el frame 1, `sSig` a 4 en el frame 10), abajo barridas (`dLight` levanta,
  `dSig` llega lejos a ras del piso).
- **La barrida que arranca combos salió de una búsqueda**, no a ojo: se probaron empuje
  vertical (-10, -12, -14), horizontal (2, 3, 4), escalado (6, 10, 14) y hitstun (10, 14, 18)
  con `followsUp`, pidiendo: combo con un aéreo a 0, 20 y 40; ninguno a 100; ningún loop.
  Pasaron 6 de 81. Se eligió **-14 / 2 / 10 / 18** porque es la única que además deja al rival
  **fuera del alcance de los golpes de piso** (sólo lo agarra un aéreo, o sea, hay que saltar).
  Con -12 también entraba el puño de costado; con escalado 6 seguía siendo combo a 100.
- **Resultado:** `dLight → nAir / sAir / dAir` es combo real de 0 a 60 de daño y se corta a 80.
  A 0 y 20 también entra el recovery, y a 20 la caída en picada. A 100, ningún par de los 121.
- Ventaja de los nuevos (0 / 50 / 100 de daño): `nLight` +1 / +2 / +2, `dLight` +12 / +16 / +20
  (con el rival 70-90 px arriba: por eso sólo lo agarra un aéreo), `nSig` -2 / +1 / +4,
  `dSig` -7 / -5 / -3 (castigable si pega de cerca, pero manda a 150-300 px).
- **KO:** la bocanada de costado sigue matando a 120 desde el centro. La barrida larga (`dSig`)
  a 120 te deja colgando del borde y a 150 te saca. **El gancho (`nSig`) no mata por arriba**:
  `maxFall` recorta la velocidad vertical del empuje a 16 px/frame (el hallazgo 6 del punto de
  partida). Se decide en F4, junto con el spike.
- La caja de `dSig` llega hasta 60 px y no 70: el frame del dibujo termina a 62 del origen y la
  caja no puede llegar más lejos que el humo que la muestra.
- `sLight` y `sSig` se quedaron con las hojas de siempre (`light_ground` y `heavy`): eran esos
  golpes. Hojas nuevas: `n_light`, `d_light`, `n_sig`, `d_sig`. Siguen entrando en 2 páginas.

### F2 hecha (2026-09-25) — SIM_VERSION 6

- **El recovery**: startup 3, activo 6, recovery 16. En el frame 3 la velocidad vertical *pasa a
  ser* -13 (el salto de piso es -13,5 y el de aire -12). Caja arriba de la cabeza, empuja para
  arriba. Una vez por vuelo; se recarga al aterrizar y al recibir un golpe, no al colgarse.
- Gastado, apretar fuerte en el aire (sin apuntar abajo) no hace nada y el botón guardado se
  descarta; el resto del frame sigue (se puede mover y saltar).
- **Probado y descartado: darle también velocidad horizontal al impulso.** Con 2, 3 o 4 px/frame
  no cambió ni un caso de la grilla de recuperación: el que vuelve ya viene derivando a la
  velocidad máxima, así que fijarle una horizontal más baja sólo lo frena. El recovery sube; la
  distancia horizontal la pone la deriva.
- **La deriva bajó de 5,6 a 4,8.** Grilla de recuperación (x = px afuera del borde, y = px por
  debajo del piso; S = vuelve sin recovery, R = vuelve con):

  | | x 170 | 200 | 230 | 260+ |
  | --- | --- | --- | --- | --- |
  | 5,6 · y 200 | S R | S R | S R | — |
  | 5,6 · y 280 | S R | S R | R | — |
  | **4,8 · y 200** | S R | S R | **R** | — |
  | **4,8 · y 280** | S R | **R** | **R** | — |
  | **4,8 · y 320** | **R** | **R** | **R** | — |

  Con 4,8 aparece una franja donde sólo se vuelve con el recovery, que es lo que convierte
  gastarlo en una decisión. De 260 px para afuera no se vuelve con nada: el fuerte sigue matando.
  Con 4,4 empieza a faltar incluso con el recovery. Los tests de KO por daño siguen pasando.
- El dibujo: gancho para arriba con el cuerpo estirado; el humo cubre la parte de arriba de la
  caja, como en los otros golpes.
- Ventaja nueva: el recovery pegando de cerca queda **-2 a 0 de daño** (castigable, a propósito:
  es para volver, no para pegar) y hasta +2 a 100. Combos reales: siguen en 0 de 121.

### A0 hecha (2026-09-25) — sin cambio de sim

- **El test de VRAM medía mal.** Sumaba ancho × alto × 4 de cada PNG (daba 17 MB), pero Kaplay
  mete todo lo que entra en un atlas de páginas de 2048×2048 y **cada página son 16 MB enteros**.
  Con las hojas a 2x la pelea abría **3 páginas: 48 MB**, más 16 del atlas de la fuente. Con los
  once golpes a 2x hubieran sido **5 páginas (80 MB)**: cerca de los 119 MB que ya habían tirado
  la pestaña en MrDrop Run.
- `src/games/kaplay/atlas.ts` repite el empaquetado de Kaplay 3001 (estantes, padding 0) y los
  tests lo usan con el peor de varios órdenes, porque el orden real es el de llegada de las
  imágenes por la red.
- **Hojas a 1x.** El arte ya se dibujaba a 1 px y se escalaba 2x al exportar; Kaplay dibuja con
  filtro "nearest" (su default), así que agrandar en la GPU da lo mismo. Verificado: las 22 hojas
  nuevas agrandadas 2x son idénticas píxel a píxel a las viejas. Resultado: **2 páginas (32 MB)**
  hoy, y **2 con los once golpes**.
- Si alguien cambia a `texFilter: 'linear'`, el pixel art se ve borroso: está escrito en
  `fightSprites.config.ts`.
- Queda lugar para ahorrar más: la azotea del escenario también está a 2x (`textureScale`).

### Cada golpe con su animación (2026-09-25)

Pedido de Martín: cada ataque tiene su propia animación. Decidido que el dibujo entra **en la
misma fase** que los datos del golpe, no en una fase de arte al final: el golpe del rival se lee
por el dibujo, y uno que se ve como otro engaña. Los sonidos pueden seguir por familia (son
grabaciones de la comunidad, no se generan).

Hace falta lugar primero: las hojas se sirven escaladas 2x y ya ocupan ~17 MB de los 20 que
permite el test (120 dibujos de 192×192). Servirlas a 1x y escalar en la vista con filtro "nearest" da el mismo pixel art
con un cuarto de la VRAM (fase A0). Los dibujos se hacen por código (`tools/rasta-sprites`:
esqueletos de poses en `anims.py`), así que un golpe nuevo son números, no píxeles.

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
