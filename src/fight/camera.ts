/**
 * La cámara: sigue a los dos peleadores y se aleja lo necesario para que
 * ninguno se salga de cuadro.
 *
 * Es estrictamente vista. No entra al `MatchState` ni al hash, y nada de lo que
 * decide puede volver a la simulación — si la cámara influyera en el juego, dos
 * peers con ventanas de distinto tamaño estarían jugando a cosas distintas.
 *
 * Se recalcula en el tick y no en el frame de render: así el suavizado avanza al
 * mismo ritmo en una pantalla de 60 Hz que en una de 144, y el movimiento de
 * cámara se siente igual en las dos.
 */

import { toPixels } from './sim/fixed'
import { PLAYERS, type MatchState } from './sim/state'
import type { World } from './sim/world'

export interface Camera {
  /** Centro del encuadre, en píxeles de mundo. */
  readonly x: number
  readonly y: number
  readonly scale: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

/**
 * Aire alrededor de los peleadores. Sin esto la cámara los deja pegados al borde
 * de la pantalla y no se ve venir nada de lo que pasa afuera del cuadro.
 */
const PADDING = 150

/**
 * Cuánto se puede acercar y alejar. El máximo es el que da la sensación de
 * pelea cuerpo a cuerpo; el mínimo es el que evita que dos que se van a las
 * puntas conviertan a los personajes en dos puntitos.
 */
const MIN_SCALE = 0.62
const MAX_SCALE = 1.25

export function initialCamera(world: World, view: Viewport): Camera {
  return targetCamera(null, world, view, defaultCenter(world))
}

function defaultCenter(world: World): { x: number; y: number } {
  const stage = world.stage
  return {
    x: toPixels(stage.ground.left + stage.ground.right) / 2,
    y: toPixels(stage.ground.top) - 90,
  }
}

/**
 * Dónde tendría que estar la cámara para este estado. Encuadra a los dos: el
 * centro es el punto medio y el zoom sale de la distancia que los separa, así
 * que seguir a uno sin perder al otro es la misma cuenta.
 */
export function targetCamera(
  state: MatchState | null,
  world: World,
  view: Viewport,
  fallback = defaultCenter(world),
): Camera {
  if (!state) return clampToStage({ ...fallback, scale: MAX_SCALE }, world, view)

  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity

  for (const index of PLAYERS) {
    const fighter = state.fighters[index]
    if (fighter.state === 'dead') continue
    const tuning = world.tuning[index]
    left = Math.min(left, toPixels(fighter.x - tuning.halfWidth))
    right = Math.max(right, toPixels(fighter.x + tuning.halfWidth))
    top = Math.min(top, toPixels(fighter.y - tuning.height))
    bottom = Math.max(bottom, toPixels(fighter.y))
  }

  if (left > right) return clampToStage({ ...fallback, scale: MAX_SCALE }, world, view)

  const scale = Math.min(
    MAX_SCALE,
    Math.max(
      MIN_SCALE,
      Math.min(view.width / (right - left + PADDING * 2), view.height / (bottom - top + PADDING * 2)),
    ),
  )

  return clampToStage({ x: (left + right) / 2, y: (top + bottom) / 2, scale }, world, view)
}

/**
 * No deja que el encuadre se vaya mucho más allá de las zonas de muerte: afuera
 * no hay nada dibujado, y ver vacío no ayuda a nadie. Si el cuadro ya es más
 * grande que el escenario, se centra y listo.
 */
function clampToStage(camera: Camera, world: World, view: Viewport): Camera {
  const stage = world.stage
  const halfWidth = view.width / (2 * camera.scale)
  const halfHeight = view.height / (2 * camera.scale)

  const minX = toPixels(stage.blastLeft) + halfWidth
  const maxX = toPixels(stage.blastRight) - halfWidth
  const minY = toPixels(stage.blastTop) + halfHeight
  const maxY = toPixels(stage.blastBottom) - halfHeight

  return {
    scale: camera.scale,
    x: minX > maxX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, camera.x)),
    y: minY > maxY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, camera.y)),
  }
}

/**
 * Acerca la cámara a donde tendría que estar. Es un seguimiento blando a
 * propósito: una cámara que calca la posición exacta de los peleadores tiembla
 * con cada salto y marea.
 */
export function approachCamera(current: Camera, target: Camera, rate = 0.12): Camera {
  return {
    x: current.x + (target.x - current.x) * rate,
    y: current.y + (target.y - current.y) * rate,
    scale: current.scale + (target.scale - current.scale) * rate,
  }
}

/** Mundo → pantalla. Todo lo que se dibuja pasa por acá. */
export function project(
  camera: Camera,
  view: Viewport,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - camera.x) * camera.scale + view.width / 2,
    y: (y - camera.y) * camera.scale + view.height / 2,
  }
}
