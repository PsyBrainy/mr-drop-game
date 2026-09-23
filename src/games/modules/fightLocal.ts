import type { KAPLAYCtx } from 'kaplay'
import { createKaplayGame } from '../kaplay/createKaplayGame'
import { readNumber, type GameContext } from '../GameModule'
import {
  approachCamera,
  initialCamera,
  project,
  targetCamera,
  type Camera,
  type Viewport,
} from '../../fight/camera'
import { startFixedClock } from '../../fight/clock'
import { OSO } from '../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../fight/data/stage'
import { toPixels } from '../../fight/sim/fixed'
import { DODGE, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../../fight/sim/input'
import { activeHitbox, isInvulnerable } from '../../fight/sim/resolve'
import {
  initialState,
  PLAYERS,
  resistanceOf,
  type Fighter,
  type MatchState,
} from '../../fight/sim/state'
import { step, TICKS_PER_SECOND } from '../../fight/sim/tick'
import { DEFAULT_RULES, type MatchRules, type World } from '../../fight/sim/world'

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

const P1 = {
  LEFT: 'KeyA', RIGHT: 'KeyD', JUMP: 'KeyW',
  LIGHT: 'KeyF', HEAVY: 'KeyG', DODGE: 'KeyS',
} as const
const P2 = {
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', JUMP: 'ArrowUp',
  LIGHT: 'Comma', HEAVY: 'Period', DODGE: 'ArrowDown',
} as const

/** Cuando la distancia entre dos ticks es más grande que esto, no se interpola. */
const TELEPORT_PX = 120

const VIEW: Viewport = { width: 960, height: 540 }

/** Ancho de la barra de resistencia, en píxeles de mundo. */
const BAR_W = 46
const BAR_H = 6

const COLORS = {
  sky: [18, 20, 30] as const,
  ground: [70, 84, 110] as const,
  blast: [190, 70, 90] as const,
  hitbox: [235, 80, 95] as const,
  hurt: [250, 235, 120] as const,
  wall: [96, 112, 142] as const,
  barBack: [16, 18, 24] as const,
  barLow: [230, 90, 80] as const,
  barMid: [235, 180, 80] as const,
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
      case P1.LIGHT: return bind(0, LIGHT)
      case P1.HEAVY: return bind(0, HEAVY)
      case P1.DODGE: return bind(0, DODGE)
      case P2.LEFT: return bind(1, LEFT)
      case P2.RIGHT: return bind(1, RIGHT)
      case P2.JUMP: return bind(1, JUMP)
      case P2.LIGHT: return bind(1, LIGHT)
      case P2.HEAVY: return bind(1, HEAVY)
      case P2.DODGE: return bind(1, DODGE)
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

export function drawFighter(
  k: KAPLAYCtx,
  camera: Camera,
  fighter: Fighter,
  previous: Fighter,
  alpha: number,
  index: 0 | 1,
  rules: MatchRules,
): void {
  if (fighter.state === 'dead') return

  const width = toPixels(OSO.halfWidth) * 2
  const height = toPixels(OSO.height)
  const worldX = interpolate(toPixels(previous.x), toPixels(fighter.x), alpha)
  const worldY = interpolate(toPixels(previous.y), toPixels(fighter.y), alpha)
  const feet = project(camera, VIEW, worldX, worldY)
  const scale = camera.scale

  // El cuerpo cambia de color según lo que está haciendo: sin animaciones, es lo
  // único que distingue "estoy atacando" de "me están pegando".
  const tint =
    fighter.state === 'hitstun' ? COLORS.hurt
    : fighter.state === 'attack' ? COLORS.hitbox
    : COLORS.player[index]

  // Parpadea mientras es invulnerable, como en cualquier juego con vidas: es la
  // forma más barata de que se entienda que ese golpe no iba a contar.
  const blinking = isInvulnerable(fighter, OSO) && Math.floor(fighter.stateFrames / 3) % 2 === 0

  k.drawRect({
    pos: k.vec2(feet.x, feet.y),
    width: width * scale,
    height: height * scale,
    anchor: 'bot',
    radius: 4 * scale,
    color: k.rgb(tint[0], tint[1], tint[2]),
    opacity: blinking ? 0.35 : 1,
  })

  // Una marca al frente para ver hacia dónde mira. Cuando haya sprites se va.
  k.drawRect({
    pos: k.vec2(feet.x + ((width / 2) * fighter.facing) * scale, feet.y - height * 0.72 * scale),
    width: 6 * scale,
    height: 6 * scale,
    anchor: 'center',
    color: k.rgb(245, 245, 255),
    opacity: blinking ? 0.35 : 1,
  })

  drawResistance(k, camera, fighter, worldX, worldY - height - 14, rules)
}

/**
 * La barra de resistencia, arriba de la cabeza y no en un HUD fijo: con la
 * cámara moviéndose, lo que importa es poder mirar al rival y saber de una
 * cuánto le queda antes de que el próximo fuerte lo mande afuera.
 */
function drawResistance(
  k: KAPLAYCtx,
  camera: Camera,
  fighter: Fighter,
  worldX: number,
  worldY: number,
  rules: MatchRules,
): void {
  const ratio = resistanceOf(fighter, rules) / rules.maxResistance
  const at = project(camera, VIEW, worldX, worldY)
  const width = BAR_W * camera.scale
  const height = BAR_H * camera.scale

  k.drawRect({
    pos: k.vec2(at.x, at.y),
    width,
    height,
    anchor: 'center',
    color: k.rgb(COLORS.barBack[0], COLORS.barBack[1], COLORS.barBack[2]),
    opacity: 0.85,
  })

  if (ratio <= 0) return

  const fill = ratio > 0.5 ? COLORS.player[0] : ratio > 0.25 ? COLORS.barMid : COLORS.barLow
  k.drawRect({
    // Se vacía desde la derecha: el ancla a la izquierda mantiene el borde
    // quieto y así se lee cuánto queda de un vistazo.
    pos: k.vec2(at.x - width / 2, at.y),
    width: width * ratio,
    height,
    anchor: 'left',
    color: k.rgb(fill[0], fill[1], fill[2]),
  })
}

/**
 * La caja del golpe, mientras está activa. Es una ayuda de desarrollo y se va
 * cuando haya sprites, pero hasta entonces es la única forma de ver el frame
 * data: cuánto tarda en salir, cuánto dura y hasta dónde llega.
 */
export function drawHitbox(k: KAPLAYCtx, camera: Camera, fighter: Fighter): void {
  const box = activeHitbox(fighter, OSO)
  if (!box) return

  const at = project(camera, VIEW, toPixels(box.left), toPixels(box.top))
  k.drawRect({
    pos: k.vec2(at.x, at.y),
    width: toPixels(box.right - box.left) * camera.scale,
    height: toPixels(box.bottom - box.top) * camera.scale,
    anchor: 'topleft',
    color: k.rgb(COLORS.hitbox[0], COLORS.hitbox[1], COLORS.hitbox[2]),
    opacity: 0.45,
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

export function drawStage(k: KAPLAYCtx, camera: Camera): void {
  const left = toPixels(SMALL_STAGE.ground.left)
  const right = toPixels(SMALL_STAGE.ground.right)
  const top = toPixels(SMALL_STAGE.ground.top)
  const bottom = toPixels(SMALL_STAGE.ground.bottom)
  const corner = project(camera, VIEW, left, top)

  k.drawRect({
    pos: k.vec2(corner.x, corner.y),
    width: (right - left) * camera.scale,
    height: (bottom - top) * camera.scale,
    anchor: 'topleft',
    color: k.rgb(COLORS.ground[0], COLORS.ground[1], COLORS.ground[2]),
  })

  // Los costados, marcados: son de donde uno se puede agarrar, así que tienen
  // que leerse como algo distinto del resto del bloque.
  for (const x of [left, right]) {
    const edge = project(camera, VIEW, x, top)
    k.drawRect({
      pos: k.vec2(edge.x, edge.y),
      width: 5 * camera.scale,
      height: (bottom - top) * camera.scale,
      anchor: 'top',
      color: k.rgb(COLORS.wall[0], COLORS.wall[1], COLORS.wall[2]),
    })
  }

  // Las zonas de muerte, marcadas: sin verlas no se entiende por qué moriste.
  for (const x of [toPixels(SMALL_STAGE.blastLeft), toPixels(SMALL_STAGE.blastRight)]) {
    const line = project(camera, VIEW, x, toPixels(SMALL_STAGE.blastTop))
    k.drawRect({
      pos: k.vec2(line.x, line.y),
      width: 3 * camera.scale,
      height: toPixels(SMALL_STAGE.blastBottom - SMALL_STAGE.blastTop) * camera.scale,
      anchor: 'top',
      color: k.rgb(COLORS.blast[0], COLORS.blast[1], COLORS.blast[2]),
      opacity: 0.5,
    })
  }
}

/**
 * Un frame entero, a partir del estado. Es toda la vista: nada de acá decide
 * nada del juego, y por eso se puede verificar con un `k` de mentira que anota
 * los rectángulos que se pidieron.
 */
export function drawMatch(
  k: KAPLAYCtx,
  camera: Camera,
  state: MatchState,
  previous: MatchState,
  alpha: number,
  rules: MatchRules = DEFAULT_RULES,
): void {
  drawStage(k, camera)
  for (const index of PLAYERS) {
    drawFighter(k, camera, state.fighters[index], previous.fighters[index], alpha, index, rules)
  }
  // Las cajas van arriba de todo: si quedaran debajo de un cuerpo no se verían
  // justo cuando importa, que es cuando se tocan.
  for (const index of PLAYERS) drawHitbox(k, camera, state.fighters[index])
}

function start(k: KAPLAYCtx, context: GameContext): () => void {
  const stocks = readNumber(context.config, 'stocks', DEFAULT_RULES.stocks)
  const world: World = {
    stage: SMALL_STAGE,
    tuning: [OSO, OSO],
    rules: { ...DEFAULT_RULES, stocks },
  }

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

  const hud = (state: MatchState): void => {
    context.onStatusChange({
      'P1 vidas': state.fighters[0].stocks,
      'P1 resistencia': resistanceOf(state.fighters[0], world.rules),
      'P2 vidas': state.fighters[1].stocks,
      'P2 resistencia': resistanceOf(state.fighters[1], world.rules),
      tick: state.tick,
    })
  }

  const clock = startFixedClock(() => {
    if (finished) return

    previous = current
    current = step(current, [inputs[0], inputs[1]], world)

    previousCamera = camera
    camera = approachCamera(camera, targetCamera(current, world, VIEW))

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
    const alpha = Math.min(1, clock.alpha())
    const shown: Camera = {
      x: previousCamera.x + (camera.x - previousCamera.x) * alpha,
      y: previousCamera.y + (camera.y - previousCamera.y) * alpha,
      scale: previousCamera.scale + (camera.scale - previousCamera.scale) * alpha,
    }
    drawMatch(k, shown, current, previous, alpha, world.rules)
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
    'Jugador 1: A y D para moverse, W salto, F golpe rápido, G golpe fuerte, S esquive. ' +
    'Jugador 2: flechas, arriba salto, coma golpe rápido, punto golpe fuerte, abajo esquive. ' +
    'Nadie tiene vida: el daño que acumulás hace que te manden más lejos, y se pierde una vida al salir de la pantalla. ' +
    'El fuerte mata pero tarda en salir; los rápidos acumulan. El esquive cubre unos frames y en el aire gasta un salto. ' +
    'Si llegás al costado de la plataforma te podés colgar y saltar desde ahí, pero se resbala y el agarre se gasta.',
  setup: { width: VIEW.width, height: VIEW.height, background: [COLORS.sky[0], COLORS.sky[1], COLORS.sky[2]] },
  start,
})
