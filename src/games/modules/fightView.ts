import type { KAPLAYCtx } from 'kaplay'
import { project, type Camera, type Viewport } from '../../fight/camera'
import { OSO } from '../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../fight/data/stage'
import { toPixels } from '../../fight/sim/fixed'
import { activeHitbox, isInvulnerable } from '../../fight/sim/resolve'
import { PLAYERS, resistanceOf, type Fighter, type MatchState } from '../../fight/sim/state'
import { DEFAULT_RULES, type MatchRules } from '../../fight/sim/world'

/**
 * Cómo se ve una pelea. Lo comparten la versión local y la online: las dos
 * dibujan exactamente lo mismo a partir de un `MatchState`, y la única
 * diferencia entre ellas es de dónde sale ese estado — de dos teclados en la
 * misma máquina, o de dos simulaciones separadas por un cable.
 *
 * Nada de acá decide nada del juego. Son funciones puras sobre el estado, y por
 * eso se pueden verificar con un `k` de mentira que anota los rectángulos.
 */

/** El mundo mide lo mismo que el canvas: la cámara hace el resto. */
export const VIEW: Viewport = { width: 960, height: 540 }

/** Cuando la distancia entre dos ticks es más grande que esto, no se interpola. */
const TELEPORT_PX = 120

/** Ancho de la barra de resistencia, en píxeles de mundo. */
const BAR_W = 46
const BAR_H = 6

export const COLORS = {
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
