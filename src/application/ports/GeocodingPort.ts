import type { Coordinates } from '../../domain/user/UserAddress'

export interface GeocodingPort {
  /** Dirección legible para un punto, o null si no se pudo resolver. */
  reverse(point: Coordinates, signal?: AbortSignal): Promise<string | null>
}
