import type { KAPLAYCtx } from 'kaplay'
import { project, type Camera, type Viewport } from '../../fight/camera'
import { OSO } from '../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../fight/data/stage'
import { toPixels } from '../../fight/sim/fixed'
import { activeHitbox, isInvulnerable } from '../../fight/sim/resolve'
import { PLAYERS, type Fighter, type MatchState } from '../../fight/sim/state'
import type { TagAnchor } from './fightHud'
import {
  ANIMS,
  ART_SCALE,
  FEET_Y,
  FRAME_PX,
  ORIGIN_X,
  SHEETS,
  SKINS,
  skinOf,
  respawnReveal,
  spriteFrame,
  spriteKey,
  spriteSrc,
} from './fightSprites.config'
import { LAYERS, layerCamera, PLATFORM, SKY, SOFT_PLATFORM, STAGE_SPRITES } from './fightStage.config'
import { platformAt } from '../../fight/sim/platforms'

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

/**
 * Cuánto arriba de los pies va el cartel con el nombre, en px de mundo: el alto
 * del cuerpo más el gorro y un poco de aire.
 */
const TAG_ABOVE_FEET = 70

export const COLORS = {
  // El fondo del canvas mientras baja el cielo: el mismo tono que su franja de arriba.
  sky: [12, 10, 30] as const,
  blast: [190, 70, 90] as const,
  hitbox: [235, 80, 95] as const,
  player: [
    [90, 200, 240],
    [245, 160, 70],
  ] as const,
}

/**
 * Carga todo el arte de la pelea: las hojas de las dos pieles y el escenario.
 * Se llama al arrancar; mientras no terminaron de bajar, `drawSprite` no dibuja
 * nada y el arte aparece un instante después — preferible a frenar el arranque
 * esperando las texturas.
 */
export function loadFightAssets(k: KAPLAYCtx): void {
  for (const sprite of STAGE_SPRITES) k.loadSprite(sprite.key, sprite.src)
  for (const skin of SKINS) {
    for (const anim of ANIMS) {
      k.loadSprite(spriteKey(skin, anim), spriteSrc(skin, anim), { sliceX: SHEETS[anim].frames })
    }
  }
}

export function drawFighter(
  k: KAPLAYCtx,
  camera: Camera,
  fighter: Fighter,
  previous: Fighter,
  alpha: number,
  index: 0 | 1,
): void {
  if (fighter.state === 'dead') return

  const worldX = interpolate(toPixels(previous.x), toPixels(fighter.x), alpha)
  const worldY = interpolate(toPixels(previous.y), toPixels(fighter.y), alpha)
  const feet = project(camera, VIEW, worldX, worldY)

  // Parpadea mientras es invulnerable, como en cualquier juego con vidas: es la
  // forma más barata de que se entienda que ese golpe no iba a contar.
  const blinking = isInvulnerable(fighter, OSO) && Math.floor(fighter.stateFrames / 3) % 2 === 0

  // El sprite se ubica por los pies, no por su centro: el origen está medido en
  // la hoja y es el mismo para todas, así que apoya igual sea cual sea el dibujo.
  // Espejado, el origen queda a la misma distancia del borde derecho del frame.
  const shown = spriteFrame(fighter)
  const scale = camera.scale * ART_SCALE

  // Esperando para reaparecer: al final el personaje se va viendo detrás del
  // humo (se dibuja antes, así la nube lo tapa), y encima va el porro o el humo.
  const reveal = respawnReveal(fighter)
  if (fighter.state === 'respawn' && reveal > 0) {
    const originBehind = fighter.facing === -1 ? FRAME_PX - ORIGIN_X : ORIGIN_X
    k.drawSprite({
      sprite: spriteKey(skinOf(index), 'idle'),
      frame: 0,
      pos: k.vec2(feet.x - originBehind * scale, feet.y - FEET_Y * scale),
      anchor: 'topleft',
      scale,
      flipX: fighter.facing === -1,
      opacity: reveal,
    })
  }

  const originX = shown.flip ? FRAME_PX - ORIGIN_X : ORIGIN_X
  k.drawSprite({
    sprite: spriteKey(skinOf(index), shown.anim),
    frame: shown.frame,
    pos: k.vec2(feet.x - originX * scale, feet.y - FEET_Y * scale),
    anchor: 'topleft',
    scale,
    flipX: shown.flip,
    opacity: blinking ? 0.35 : 1,
  })
}

/**
 * Dónde va el nombre de cada peleador, en coordenadas del canvas. Lo dibuja el
 * HUD en HTML (nada de texto en el canvas); acá sólo se calcula el punto, con la
 * misma interpolación que el sprite para que el cartel no se despegue de la cabeza.
 */
export function tagAnchors(
  camera: Camera,
  state: MatchState,
  previous: MatchState,
  alpha: number,
): [TagAnchor, TagAnchor] {
  const anchor = (index: 0 | 1): TagAnchor => {
    const fighter = state.fighters[index]
    // Mientras espera para reaparecer no hay nadie a quien ponerle el nombre.
    if (fighter.state === 'dead' || fighter.state === 'respawn') return null
    const before = previous.fighters[index]
    const x = interpolate(toPixels(before.x), toPixels(fighter.x), alpha)
    const y = interpolate(toPixels(before.y), toPixels(fighter.y), alpha)
    return project(camera, VIEW, x, y - TAG_ABOVE_FEET)
  }
  return [anchor(0), anchor(1)]
}

/**
 * La caja del golpe, mientras está activa. Es una ayuda de desarrollo: con los
 * sprites puestos sirve para comparar el dibujo contra la caja de verdad — el
 * humo del impacto tiene que tapar el tramo final de cada una.
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
  // El cielo, pegado a la pantalla.
  k.drawSprite({ sprite: SKY.key, pos: k.vec2(0, 0), width: VIEW.width, height: VIEW.height })

  // La ciudad, de lejos a cerca, cada capa con su propia cámara más lenta.
  for (const layer of LAYERS) {
    const lens = layerCamera(camera, layer.parallax)
    const corner = project(lens, VIEW, layer.x, layer.y)
    k.drawSprite({
      sprite: layer.key,
      pos: k.vec2(corner.x, corner.y),
      width: layer.width * lens.scale,
      height: layer.height * lens.scale,
    })

    // Debajo de la capa, su último color hasta el borde de la pantalla: siguiendo
    // a alguien que se cae, la cámara baja y no tiene que asomar el cielo.
    const bottom = corner.y + layer.height * lens.scale
    if (bottom < VIEW.height) {
      k.drawRect({
        pos: k.vec2(0, bottom),
        width: VIEW.width,
        height: VIEW.height - bottom,
        anchor: 'topleft',
        color: k.rgb(layer.floor[0], layer.floor[1], layer.floor[2]),
      })
    }
  }

  // La azotea: su cornisa coincide con el piso de la sim (lo verifica el test).
  const corner = project(camera, VIEW, PLATFORM.x, PLATFORM.y)
  k.drawSprite({
    sprite: PLATFORM.key,
    pos: k.vec2(corner.x, corner.y),
    width: PLATFORM.width * camera.scale,
    height: PLATFORM.height * camera.scale,
  })

  // Las zonas de muerte, marcadas: sin verlas no se entiende por qué moriste.
  // Más tenues que antes: ahora compiten con un fondo.
  for (const x of [toPixels(SMALL_STAGE.blastLeft), toPixels(SMALL_STAGE.blastRight)]) {
    const line = project(camera, VIEW, x, toPixels(SMALL_STAGE.blastTop))
    k.drawRect({
      pos: k.vec2(line.x, line.y),
      width: 3 * camera.scale,
      height: toPixels(SMALL_STAGE.blastBottom - SMALL_STAGE.blastTop) * camera.scale,
      anchor: 'top',
      color: k.rgb(COLORS.blast[0], COLORS.blast[1], COLORS.blast[2]),
      opacity: 0.3,
    })
  }
}

/**
 * Las flotantes, donde la sim dice que están: su posición es una función del
 * tick, así que se interpola entre el tick anterior y el actual igual que los
 * personajes, y el que está parado encima no se despega del dibujo.
 */
export function drawPlatforms(
  k: KAPLAYCtx,
  camera: Camera,
  state: MatchState,
  previous: MatchState,
  alpha: number,
): void {
  const art = SOFT_PLATFORM
  for (const platform of SMALL_STAGE.platforms) {
    const from = platformAt(platform, previous.tick)
    const to = platformAt(platform, state.tick)
    const left = interpolate(toPixels(from.left), toPixels(to.left), alpha)
    const top = interpolate(toPixels(from.top), toPixels(to.top), alpha)
    const corner = project(camera, VIEW, left - art.insetX, top - art.surfaceY / art.textureScale)
    k.drawSprite({
      sprite: art.key,
      pos: k.vec2(corner.x, corner.y),
      width: art.width * camera.scale,
      height: art.height * camera.scale,
    })
  }
}

/**
 * Un frame entero, a partir del estado. Es toda la vista: nada de acá decide
 * nada del juego, y por eso se puede verificar con un `k` de mentira que anota
 * los rectángulos que se pidieron.
 */
export interface DrawOptions {
  /**
   * Dibujar las cajas de golpe activas. Es una ayuda de desarrollo para ajustar
   * el frame data contra el dibujo; en el juego no se ve. En la pelea local se
   * prende con `?cajas` en la URL del sandbox.
   */
  readonly hitboxes?: boolean
}

export function drawMatch(
  k: KAPLAYCtx,
  camera: Camera,
  state: MatchState,
  previous: MatchState,
  alpha: number,
  options: DrawOptions = {},
): void {
  drawStage(k, camera)
  drawPlatforms(k, camera, state, previous, alpha)
  for (const index of PLAYERS) {
    drawFighter(k, camera, state.fighters[index], previous.fighters[index], alpha, index)
  }
  // Las cajas van arriba de todo: si quedaran debajo de un cuerpo no se verían
  // justo cuando importa, que es cuando se tocan.
  if (!options.hitboxes) return
  for (const index of PLAYERS) drawHitbox(k, camera, state.fighters[index])
}
