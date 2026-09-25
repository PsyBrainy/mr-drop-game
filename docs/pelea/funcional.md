# Pelea — documentación funcional

Cómo se juega, visto desde el jugador. Los números salen del código (`data/characters/oso.ts`,
`sim/world.ts`, `games/modules/fightControls.ts`): si cambian ahí, cambian acá en el mismo commit.

## Modos

| Modo | Contra quién | Cuenta para el ranking | Dónde |
| --- | --- | --- | --- |
| Online | Otra persona, por psy-ws | Sí, si se juega desde un concurso, los dos están verificados y el validador la confirma | Catálogo de juegos; el admin la prende por evento |
| Contra el bot | "Rasta Bot", con nivel, en el navegador | No (no pasa por el servidor) | Se ofrece si pasan 10 segundos buscando rival; nunca se juega contra el bot sin elegirlo |
| Local | Dos personas en un teclado | No | Sólo en el sandbox y con `VITE_ENABLE_FIGHT_LOCAL=true` |

Antes del primer frame hay una cuenta: "3, 2, 1, ¡Buenos Humos!".

## Cómo se gana

- Cada uno arranca con **3 vidas**. Se pierde una al salir del escenario por cualquier lado
  (ring-out). Sin vidas, perdió. Si los dos salen en el mismo frame, es empate.
- No hay barra de vida que baje hasta cero y te mate: cada golpe suma **daño acumulado**, y
  cuanto más daño tenés, **más lejos te manda el próximo golpe**. Lo que mata es salir volando.
- La barra de **resistencia** que se ve es ese daño al revés (arranca en 100). Llega a 0 y el
  daño sigue subiendo por debajo: con la barra vacía cada golpe te manda más lejos.
- Al perder una vida el daño vuelve a 0 y se reaparece con **1 segundo de invulnerabilidad**.
- Online, abandonar es perder (salvo que la partida ya hubiera terminado).

## Moverse

- Caminar, y **tres saltos**: uno desde el piso y dos en el aire (los del aire suben un poco
  menos). Apretar salto justo antes de tocar el piso también cuenta.
- En el aire se conserva la inercia: soltar la dirección no frena.
- **Colgarse del borde**: al llegar contra el costado de la plataforma principal el personaje se
  agarra y resbala despacio. Desde ahí se salta de vuelta (no gasta saltos) o se suelta
  empujando para afuera. Se puede estar colgado ~¾ de segundo por vuelo; se recarga al tocar el
  piso. Mientras te están mandando a volar no te podés agarrar.
- **Plataformas flotantes**: se atraviesan desde abajo y de costado, se aterriza desde arriba, y
  con abajo se baja atravesándola. Se mueven de lado a lado y te llevan encima.

## Pelear (hoy: 3 golpes)

| Golpe | Cuándo | Sale en | Te deja vendido | Para qué |
| --- | --- | --- | --- | --- |
| Rápido de piso | Rápido parado | 4 frames | 10 | Meter daño |
| Rápido aéreo | Rápido en el aire | 5 | 12 | Castigar al que salta, sacar al que vuelve |
| Fuerte | Fuerte, piso o aire | 12 | 22 | El que mata |

- Al pegar podés apuntar para el otro lado: el personaje se da vuelta.
- Abajo + golpe arriba de una plataforma flotante pega; abajo solo es lo que te baja.
- Si los dos pegan en el mismo frame gana el fuerte; si son del mismo tipo, **choque**: nadie
  cobra y los dos rebotan.
- Un aéreo que no terminó cuando tocás el piso te deja unos frames sin control.
- El que recibe un golpe queda sin control un rato que crece con lo lejos que sale volando.

Lo que viene (golpes con dirección, el fuerte aéreo que impulsa, combos) está en `tareas.md`, M6.

## Esquive

La única defensa. Unos frames de invulnerabilidad (arranca un poquito después de apretar, así que
hay que adelantarse) y después un rato vendido si erraste el momento. Sin dirección es en el
lugar; con dirección te desplaza para ese lado. En el aire **gasta un salto**.

## Controles

| Acción | Teclado (jugador 1) | Teclado (jugador 2, sólo local) | Mando | Pantalla táctil |
| --- | --- | --- | --- | --- |
| Moverse | ← → | A D | Stick izquierdo o cruz | Stick (aparece donde tocás, a la izquierda) |
| Saltar | ↑ | W | A / ✕ | Salto |
| Bajarse de una flotante | ↓ | S | Cruz ↓ o stick bien abajo | Stick ↓ |
| Rápido | Z | F | X / ▢ | Rápido |
| Fuerte | X | G | Y / △ o B / ◯ | Fuerte |
| Esquive | C | H | LB / RB | Esquive |

El cartel de controles del juego sale de `fightHelp.ts` con las mismas teclas.

## Ranking

"Ganadas / perdidas" por juego de concurso (vista `fight_leaderboard`). Sólo cuentan partidas
online jugadas desde un concurso, con los dos jugadores verificados y confirmadas por el
validador, que re-juega la partida entera para ver que el resultado sea el que dijeron los
clientes.
