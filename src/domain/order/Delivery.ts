import type { Coordinates } from '../user/UserAddress'

export interface DeliverySettings {
  readonly feeInside: number
  readonly feeOutside: number
  /** Vértices del casco urbano, en orden, sin repetir el primero. */
  readonly zone: Coordinates[]
}

export interface DeliveryQuote {
  readonly inside: boolean
  readonly fee: number
}

/** Ray casting. Misma regla que la base: zona vacía = todo adentro. */
export function isInsideZone(point: Coordinates, zone: Coordinates[]): boolean {
  if (zone.length < 3) return true
  let inside = false
  for (let i = 0, j = zone.length - 1; i < zone.length; j = i++) {
    const { lat: yi, lng: xi } = zone[i]!
    const { lat: yj, lng: xj } = zone[j]!
    const crosses = yi > point.lat !== yj > point.lat
    if (crosses && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function quoteDelivery(point: Coordinates, settings: DeliverySettings): DeliveryQuote {
  const inside = isInsideZone(point, settings.zone)
  return { inside, fee: inside ? settings.feeInside : settings.feeOutside }
}

export const MIN_ZONE_VERTICES = 3
