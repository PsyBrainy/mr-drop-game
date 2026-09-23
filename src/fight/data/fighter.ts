/**
 * El ajuste del personaje base, en unidades de la sim: píxeles por frame y
 * píxeles por frame². Nada de segundos — el tick es la unidad de tiempo del
 * juego, y expresar una aceleración en px/s obliga a dividir por 60 en cada
 * frame, que es exactamente el tipo de cuenta que se redondea distinto en cada
 * máquina.
 *
 * Los números están elegidos para que la pelea se lea "flotante" como
 * Brawlhalla y no pesada como un Street Fighter: gravedad baja, saltos largos,
 * mucho control en el aire.
 */

import { fx, fxRatio, toPixels, type Fx } from '../sim/fixed'
import type { FighterTuning } from '../sim/world'

export const BASE_FIGHTER: FighterTuning = {
  halfWidth: fx(16),
  height: fx(56),

  walkSpeed: fxRatio(50, 10),
  groundAccel: fxRatio(7, 10),
  groundFriction: fxRatio(9, 10),

  /**
   * La deriva es la herramienta más fuerte del personaje, y es a propósito:
   * mientras no haya movimiento de recuperación ni esquive (llegan en M2), los
   * saltos son lo único que hay para volver al escenario, y volver tiene que ser
   * una cuestión de habilidad y no una moneda al aire. El test de recuperación
   * marca el piso de este número: con 4,6 no se llega ni jugando bien.
   *
   * Cuando existan el esquive y la recuperación aérea, esto puede volver a bajar.
   */
  airSpeed: fxRatio(56, 10),
  airDrift: fxRatio(35, 100),

  gravity: fxRatio(9, 10),
  maxFall: fx(16),
  jumpVelocity: fx(-13.5),
  airJumpVelocity: fx(-12),
  airJumps: 2,

  jumpBufferFrames: 4,
  landFrames: 3,
}

/**
 * De acá para abajo son medidas derivadas: las usan los tests de invariantes,
 * no el tick. Devuelven píxeles y frames en float a propósito — son cuentas de
 * análisis, no estado del juego.
 */

/** Altura máxima de un salto desde el piso: v² / 2g. */
export function jumpApexPx(tuning: FighterTuning = BASE_FIGHTER): number {
  const v = toPixels(tuning.jumpVelocity)
  const g = toPixels(tuning.gravity)
  return (v * v) / (2 * g)
}

/** Frames que dura un salto hasta volver a la altura de partida: 2v / g. */
export function jumpAirFrames(velocity: Fx, tuning: FighterTuning = BASE_FIGHTER): number {
  return (2 * Math.abs(toPixels(velocity))) / toPixels(tuning.gravity)
}

/** Frames para cruzar caminando una distancia. Sirve para ver si el escenario tiene el tamaño que queremos. */
export function walkFrames(distancePx: number, tuning: FighterTuning = BASE_FIGHTER): number {
  return distancePx / toPixels(tuning.walkSpeed)
}
