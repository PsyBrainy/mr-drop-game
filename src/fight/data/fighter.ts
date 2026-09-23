/**
 * Medidas derivadas del ajuste de un personaje: las usan los tests de
 * invariantes, no el tick. Devuelven píxeles y frames en float a propósito —
 * son cuentas de análisis, no estado del juego.
 */

import { toPixels, type Fx } from '../sim/fixed'
import type { FighterTuning } from '../sim/world'
import { OSO } from './characters/oso'

/** Altura máxima de un salto desde el piso: v² / 2g. */
export function jumpApexPx(tuning: FighterTuning = OSO): number {
  const v = toPixels(tuning.jumpVelocity)
  const g = toPixels(tuning.gravity)
  return (v * v) / (2 * g)
}

/** Frames que dura un salto hasta volver a la altura de partida: 2v / g. */
export function jumpAirFrames(velocity: Fx, tuning: FighterTuning = OSO): number {
  return (2 * Math.abs(toPixels(velocity))) / toPixels(tuning.gravity)
}

/** Frames para cruzar caminando una distancia. Sirve para ver si el escenario tiene el tamaño que queremos. */
export function walkFrames(distancePx: number, tuning: FighterTuning = OSO): number {
  return distancePx / toPixels(tuning.walkSpeed)
}
