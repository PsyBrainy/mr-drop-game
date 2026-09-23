import type { KAPLAYCtx } from 'kaplay'
import { createKaplayGame } from '../kaplay/createKaplayGame'
import { readNumber, type GameContext } from '../GameModule'
import { startFixedClock } from '../../fight/clock'
import { BASE_FIGHTER } from '../../fight/data/fighter'
import { SMALL_STAGE } from '../../fight/data/stage'
import { toPixels } from '../../fight/sim/fixed'
import { JUMP, LEFT, NONE, RIGHT, type Input } from '../../fight/sim/input'
import { initialState, PLAYERS, type Fighter, type MatchState } from '../../fight/sim/state'
import { step, TICKS_PER_SECOND } from '../../fight/sim/tick'
import { DEFAULT_RULES, type World } from '../../fight/sim/world'

/**
 * Banco de pruebas de la pelea: dos jugadores en el mismo teclado, sin red.
 *
 * Es la vista de la simulación y nada más. No decide nada: lee `MatchState` y
 * dibuja. Toda la lógica está en `src/fight/sim`, que no sabe que esto existe —
 * por eso los mismos inputs dan el mismo resultado acá, en los tests y en Node.
 *
 * La versión online (`fight.ts`, con el contrato `MatchModule`) llega en M3.
 * Ésta existe para poder SENTIR el ajuste: los números de física están
 * verificados por tests de invariantes, pero ninguna persona los jugó todavía.
 */

const P1 = { LEFT: 'KeyA', RIGHT: 'KeyD', JUMP: 'KeyW' } as const
const P2 = { LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', JUMP: 'ArrowUp' } as const

/** Cuando la distancia entre dos ticks es más grande que esto, no se interpola. */
const TELEPORT_PX = 120

const COLORS = {
  sky: [18, 20, 30] as const,
  ground: [70, 84, 110] as const,
  blast: [190, 70, 90] as const,
  player: [
    [90, 200, 240],
    [245, 160, 70],
  ] as const,
}

/**
 * El teclado se lee con listeners propios y no con `k.onKeyDown`: el input tiene
 * que ser el estado exacto en el momento del tick, y las teclas de Kaplay se
 * muestrean en su frame de render, que corre a otra frecuencia.
 */
function listenKeyboard(inputs: [Input, Input]): () => void {
  const apply = (code: string, down: boolean): boolean => {
    const bind = (player: 0 | 1, button: number): boolean => {
      inputs[player] = down ? inputs[player] | button : inputs[player] & ~button
      return true
    }

    switch (code) {
      case P1.LEFT: return bind(0, LEFT)
      case P1.RIGHT: return bind(0, RIGHT)
      case P1.JUMP: return bind(0, JUMP)
      case P2.LEFT: return bind(1, LEFT)
      case P2.RIGHT: return bind(1, RIGHT)
      case P2.JUMP: return bind(1, JUMP)
      default: return false
    }
  }

  const down = (event: KeyboardEvent): void => {
    // `repeat` se ignora: el bit ya está prendido y el auto-repeat del sistema no
    // tiene nada que ver con los frames del juego.
    if (event.repeat) return
    if (apply(event.code, true)) event.preventDefault()
  }
  const up = (event: KeyboardEvent): void => {
    if (apply(event.code, false)) event.preventDefault()
  }
  /** Si la ventana pierde el foco con una tecla apretada, el bit quedaría trabado. */
  const clear = (): void => {
    inputs[0] = NONE
    inputs[1] = NONE
  }

  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)

  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
  }
}

function drawFighter(
  k: KAPLAYCtx,
  fighter: Fighter,
  previous: Fighter,
  alpha: number,
  index: 0 | 1,
): void {
  const width = toPixels(BASE_FIGHTER.halfWidth) * 2
  const height = toPixels(BASE_FIGHTER.height)
  const x = interpolate(toPixels(previous.x), toPixels(fighter.x), alpha)
  const y = interpolate(toPixels(previous.y), toPixels(fighter.y), alpha)

  if (fighter.state === 'dead') return

  const tint = COLORS.player[index]
  // Parpadea mientras es invulnerable, como en cualquier juego con vidas: es la
  // forma más barata de que se entienda que ese golpe no iba a contar.
  const blinking = fighter.invuln > 0 && Math.floor(fighter.invuln / 4) % 2 === 0

  k.drawRect({
    pos: k.vec2(x, y),
    width,
    height,
    anchor: 'bot',
    radius: 4,
    color: k.rgb(tint[0], tint[1], tint[2]),
    opacity: blinking ? 0.35 : 1,
  })

  // Una marca al frente para ver hacia dónde mira. Cuando haya sprites se va.
  k.drawRect({
    pos: k.vec2(x + (width / 2) * fighter.facing, y - height * 0.72),
    width: 6,
    height: 6,
    anchor: 'center',
    color: k.rgb(245, 245, 255),
    opacity: blinking ? 0.35 : 1,
  })
}

/**
 * Interpola entre el tick anterior y el actual, salvo cuando el personaje
 * teletransportó: sin este corte, reaparecer haría que el muñeco cruce la
 * pantalla deslizándose desde la zona de muerte.
 */
function interpolate(from: number, to: number, alpha: number): number {
  if (Math.abs(to - from) > TELEPORT_PX) return to
  return from + (to - from) * alpha
}

function drawStage(k: KAPLAYCtx): void {
  const left = toPixels(SMALL_STAGE.ground.left)
  const right = toPixels(SMALL_STAGE.ground.right)
  const top = toPixels(SMALL_STAGE.ground.top)

  k.drawRect({
    pos: k.vec2(left, top),
    width: right - left,
    height: toPixels(SMALL_STAGE.blastBottom) - top,
    anchor: 'topleft',
    color: k.rgb(COLORS.ground[0], COLORS.ground[1], COLORS.ground[2]),
  })

  // Las zonas de muerte, marcadas: sin verlas no se entiende por qué moriste.
  for (const x of [toPixels(SMALL_STAGE.blastLeft), toPixels(SMALL_STAGE.blastRight)]) {
    k.drawRect({
      pos: k.vec2(x, 0),
      width: 3,
      height: toPixels(SMALL_STAGE.blastBottom),
      anchor: 'top',
      color: k.rgb(COLORS.blast[0], COLORS.blast[1], COLORS.blast[2]),
      opacity: 0.5,
    })
  }
}

function start(k: KAPLAYCtx, context: GameContext): () => void {
  const stocks = readNumber(context.config, 'stocks', DEFAULT_RULES.stocks)
  const world: World = {
    stage: SMALL_STAGE,
    tuning: [BASE_FIGHTER, BASE_FIGHTER],
    rules: { ...DEFAULT_RULES, stocks },
  }

  const inputs: [Input, Input] = [NONE, NONE]
  const unlisten = listenKeyboard(inputs)

  // La semilla del sandbox es fija: dos partidas con los mismos inputs tienen
  // que dar lo mismo. En red la manda el servidor.
  let current = initialState(world, 0xc0ffee)
  let previous = current
  let finished = false

  const hud = (state: MatchState): void => {
    context.onStatusChange({
      'P1 vidas': state.fighters[0].stocks,
      'P1 daño': state.fighters[0].damage,
      'P2 vidas': state.fighters[1].stocks,
      'P2 daño': state.fighters[1].damage,
      tick: state.tick,
    })
  }

  const clock = startFixedClock(() => {
    if (finished) return

    previous = current
    current = step(current, [inputs[0], inputs[1]], world)

    // El HUD es React: mandarle los cinco valores 60 veces por segundo haría
    // re-renderizar la página entera por cada tick. Con uno de cada seis alcanza
    // para que se lea al día.
    if (current.tick % 6 === 0) hud(current)

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
    drawStage(k)
    const alpha = Math.min(1, clock.alpha())
    for (const index of PLAYERS) {
      drawFighter(k, current.fighters[index], previous.fighters[index], alpha, index)
    }
  })

  hud(current)

  return () => {
    clock.stop()
    unlisten()
  }
}

export default createKaplayGame({
  slug: 'fight-local',
  name: 'Pelea (local, 2 jugadores)',
  howToPlay:
    'Jugador 1: A y D para moverse, W para saltar. Jugador 2: flechas izquierda y derecha, flecha arriba para saltar. ' +
    'Hay un salto en el piso y dos en el aire. Todavía no hay golpes: se gana tirando al otro afuera... o esperando que se caiga.',
  setup: { width: 960, height: 540, background: [COLORS.sky[0], COLORS.sky[1], COLORS.sky[2]] },
  start,
})
