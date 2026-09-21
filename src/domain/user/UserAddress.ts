export interface Coordinates {
  readonly lat: number
  readonly lng: number
}

export interface UserAddress extends Coordinates {
  readonly userId: string
  readonly label: string
  readonly updatedAt: Date
}

export const MAX_ADDRESS_LABEL = 200

export function isValidCoordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lng >= -180 &&
    value.lng <= 180
  )
}

/** Deep link universal de Waze: abre la app si está instalada, si no la web. */
export function wazeNavigationUrl(point: Coordinates): string {
  if (!isValidCoordinates(point)) throw new RangeError('Coordenadas fuera de rango')
  return `https://waze.com/ul?ll=${point.lat.toFixed(6)},${point.lng.toFixed(6)}&navigate=yes`
}

export function formatCoordinates(point: Coordinates): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
}
