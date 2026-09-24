/**
 * Dónde está cada plataforma flotante en cada tick.
 *
 * Es una función pura del tick: la plataforma no tiene estado propio, así que
 * no entra al `MatchState` ni al hash y no se puede desincronizar. Dos peers en
 * el mismo tick la ven exactamente en el mismo lugar.
 *
 * Ida y vuelta en triángulo, con enteros: un seno se vería más suave pero está
 * prohibido en la sim (ver CLAUDE.md, presupuesto de determinismo), y a la
 * velocidad a la que se mueven la diferencia no se nota.
 */

import type { Fx } from './fixed'
import type { SoftPlatform } from './world'

export interface PlatformSpan {
  readonly left: Fx
  readonly right: Fx
  readonly top: Fx
}

export function platformAt(platform: SoftPlatform, tick: number): PlatformSpan {
  const half = platform.period / 2
  const t = (tick + platform.phase) % platform.period
  // 0 → half → 0: cuánto del recorrido lleva hecho, en "pasos" de 1/half.
  const k = t < half ? t : platform.period - t
  const dx = half > 0 ? Math.trunc((platform.travelX * k) / half) : 0
  const dy = half > 0 ? Math.trunc((platform.travelY * k) / half) : 0
  const left = platform.left + dx
  return { left, right: left + platform.width, top: platform.top + dy }
}

/** ¿Los pies en `x` apoyan sobre la plataforma? El borde se extiende medio cuerpo, como en el piso. */
export function isOverPlatform(x: Fx, halfWidth: Fx, span: PlatformSpan): boolean {
  return x >= span.left - halfWidth && x <= span.right + halfWidth
}
