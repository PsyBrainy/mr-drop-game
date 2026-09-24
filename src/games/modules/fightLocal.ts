import type { KAPLAYCtx } from 'kaplay'
import { createKaplayGame } from '../kaplay/createKaplayGame'
import { readNumber, type GameContext } from '../GameModule'
import {
  approachCamera,
  initialCamera,
  targetCamera,
  type Camera,
} from '../../fight/camera'
import { listenKeyboard } from './fightControls'
import { COLORS, drawMatch, loadFightAssets, tagAnchors, VIEW } from './fightView'
import { createFightHud, panelOf } from './fightHud'
import { createTouchControls } from './fightTouch'
import { startFixedClock } from '../../fight/clock'
import { OSO } from '../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../fight/data/stage'
import { NONE, type Input } from '../../fight/sim/input'
import { initialState, type MatchState } from '../../fight/sim/state'
import { step, TICKS_PER_SECOND } from '../../fight/sim/tick'
import { DEFAULT_RULES, type World } from '../../fight/sim/world'

/**
 * Banco de pruebas de la pelea: dos jugadores en el mismo teclado, sin red.
 *
 * Es la vista de la simulación y nada más. No decide nada: lee `MatchState` y
 * dibuja. Toda la lógica está en `src/fight/sim`, que no sabe que esto existe —
 * por eso los mismos inputs dan el mismo resultado acá, en los tests y en Node.
 *
 * La versión online es `fightOnline.ts`. Ésta se quedó porque es la única forma
 * de probar el ajuste sin depender de que haya un servidor levantado y otra
 * persona del otro lado.
 */

function start(k: KAPLAYCtx, context: GameContext): () => void {
  const stocks = readNumber(context.config, 'stocks', DEFAULT_RULES.stocks)
  const world: World = {
    stage: SMALL_STAGE,
    tuning: [OSO, OSO],
    rules: { ...DEFAULT_RULES, stocks },
  }

  loadFightAssets(k)

  // Las cajas de golpe sólo con `?cajas` en la URL: sirven para ajustar el frame
  // data contra el dibujo, no para jugar.
  const hitboxes = new URLSearchParams(window.location.search).has('cajas')

  const inputs: [Input, Input] = [NONE, NONE]
  const unlisten = listenKeyboard(inputs)

  // La semilla del sandbox es fija: dos partidas con los mismos inputs tienen
  // que dar lo mismo. En red la manda el servidor.
  let current = initialState(world, 0xc0ffee)
  let previous = current
  let finished = false

  // La cámara se mueve en el tick y no en el frame de render: así el suavizado
  // avanza igual en una pantalla de 60 Hz que en una de 144.
  let camera = initialCamera(world, VIEW)
  let previousCamera = camera

  // El HUD propio de la pelea: paneles arriba y el nombre sobre cada uno. En el
  // mismo teclado no hay cuentas, así que son "Jugador 1" y "Jugador 2".
  const overlay = createFightHud(context.mountPoint, VIEW)
  // En pantallas táctiles, los controles en pantalla manejan al jugador 1.
  const touch = createTouchControls(context.mountPoint)
  overlay.setNames(['Jugador 1', 'Jugador 2'])

  // Escribe el DOM sólo lo que cambió, así que se puede llamar en cada tick.
  const hud = (state: MatchState): void => {
    overlay.update([panelOf(state.fighters[0], world.rules), panelOf(state.fighters[1], world.rules)])
  }

  const clock = startFixedClock(() => {
    if (finished) return

    previous = current
    current = step(current, [inputs[0] | touch.mask(), inputs[1]], world)

    previousCamera = camera
    camera = approachCamera(camera, targetCamera(current, world, VIEW))

    hud(current)

    if (current.over) {
      finished = true
      hud(current)
      const winner = current.winner
      context.onGameOver(0, {
        message: winner === null ? '¡Empate!' : `¡Ganó el jugador ${winner + 1}!`,
      })
    }
  }, TICKS_PER_SECOND)

  k.onDraw(() => {
    const alpha = Math.min(1, clock.alpha())
    const shown: Camera = {
      x: previousCamera.x + (camera.x - previousCamera.x) * alpha,
      y: previousCamera.y + (camera.y - previousCamera.y) * alpha,
      scale: previousCamera.scale + (camera.scale - previousCamera.scale) * alpha,
    }
    drawMatch(k, shown, current, previous, alpha, { hitboxes })
    overlay.placeTags(tagAnchors(shown, current, previous, alpha))
  })

  hud(current)

  return () => {
    clock.stop()
    unlisten()
    overlay.destroy()
    touch.destroy()
  }
}

export default createKaplayGame({
  slug: 'fight-local',
  name: 'Pelea (local, 2 jugadores)',
  howToPlay:
    'Jugador 1: A y D para moverse, W salto, F golpe rápido, G golpe fuerte, S esquive. ' +
    'Jugador 2: flechas, arriba salto, coma golpe rápido, punto golpe fuerte, abajo esquive. ' +
    'Nadie tiene vida: el daño que acumulás hace que te manden más lejos, y se pierde una vida al salir de la pantalla. ' +
    'El fuerte mata pero tarda en salir; los rápidos acumulan. El esquive cubre unos frames y en el aire gasta un salto. ' +
    'Si llegás al costado de la plataforma te podés colgar y saltar desde ahí, pero se resbala y el agarre se gasta.',
  setup: { width: VIEW.width, height: VIEW.height, background: [COLORS.sky[0], COLORS.sky[1], COLORS.sky[2]] },
  start,
})
