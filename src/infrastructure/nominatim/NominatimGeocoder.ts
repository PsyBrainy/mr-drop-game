import type { GeocodingPort } from '../../application/ports/GeocodingPort'
import type { Coordinates } from '../../domain/user/UserAddress'

interface NominatimReverse {
  display_name?: string
  address?: Partial<Record<string, string>>
}

/**
 * Geocodificación inversa con Nominatim (OpenStreetMap). Es gratis, sin key,
 * con límite de 1 pedido por segundo: quien llama debe debounce-ar.
 */
export class NominatimGeocoder implements GeocodingPort {
  async reverse(point: Coordinates, signal?: AbortSignal): Promise<string | null> {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: point.lat.toFixed(6),
      lon: point.lng.toFixed(6),
      zoom: '18',
      'accept-language': 'es',
    })
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = (await response.json()) as NominatimReverse
    return shortAddress(body)
  }
}

function shortAddress({ address, display_name }: NominatimReverse): string | null {
  if (!address) return display_name ?? null
  const street = [address.road ?? address.pedestrian, address.house_number].filter(Boolean).join(' ')
  const locality =
    address.city ?? address.town ?? address.village ?? address.suburb ?? address.municipality
  const parts = [street, locality].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : (display_name ?? null)
}
