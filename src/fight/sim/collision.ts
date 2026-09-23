/**
 * Cajas y solapamiento. Nada de `onCollide` ni de `area()` de Kaplay: las
 * colisiones de un juego de pelea se resuelven en un orden fijo y en el momento
 * exacto del tick, no cuando el motor de render note que dos polígonos se tocan.
 */

import type { Box } from './attack'
import type { Fx } from './fixed'
import type { Fighter } from './state'
import type { FighterTuning } from './world'

export interface Aabb {
  readonly left: Fx
  readonly top: Fx
  readonly right: Fx
  readonly bottom: Fx
}

/**
 * Ubica una caja del frame data en el mundo. `facing` espeja el `dx`, así que un
 * ataque dibujado para la derecha funciona igual para la izquierda sin duplicar
 * el dato — y sin que el espejado pueda quedar desalineado entre los dos peers.
 */
export function boxAt(box: Box, x: Fx, y: Fx, facing: 1 | -1): Aabb {
  const centerX = x + box.dx * facing
  const centerY = y + box.dy
  const halfWidth = Math.trunc(box.width / 2)
  const halfHeight = Math.trunc(box.height / 2)

  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY - halfHeight,
    bottom: centerY + halfHeight,
  }
}

/** El cuerpo: lo que se puede golpear. Sale del tuning, no del frame data. */
export function hurtboxOf(fighter: Fighter, tuning: FighterTuning): Aabb {
  return {
    left: fighter.x - tuning.halfWidth,
    right: fighter.x + tuning.halfWidth,
    top: fighter.y - tuning.height,
    bottom: fighter.y,
  }
}

export function overlaps(a: Aabb, b: Aabb): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}
