import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polygon, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import type { Coordinates } from '../../../domain/user/UserAddress'
import { isStale, type Courier, type LiveOrder } from '../../../domain/delivery/LiveDelivery'
import { ORDER_STATUS_LABEL, type OrderStatus } from '../../../domain/order/Order'
import { wazeNavigationUrl } from '../../../domain/user/UserAddress'

export interface MapPin extends Coordinates {
  id: string
  title: string
  subtitle?: string
}

// Leaflet antepone a las URLs del ícono una ruta que detecta desde el CSS; con Vite
// eso rompe la imagen. Se quita el detector y se pasan las URLs ya resueltas.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** La Plata: centro por defecto cuando el usuario todavía no marcó nada. */
export const DEFAULT_CENTER: Coordinates = { lat: -34.9214, lng: -57.9544 }

const toLatLng = (point: Coordinates): [number, number] => [point.lat, point.lng]

function FlyTo({ target, zoom }: { target: Coordinates | null; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(toLatLng(target), Math.max(map.getZoom(), zoom), { duration: 0.6 })
  }, [map, target, zoom])
  return null
}

function ClickToPlace({ onPick }: { onPick: (point: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

interface AddressPickerMapProps {
  value: Coordinates | null
  onChange: (point: Coordinates) => void
  /** Cambia cuando se pide recentrar (ej: geolocalización). */
  focus: Coordinates | null
  /** Texto que acompaña al pin (dirección detectada). */
  caption?: string | null
}

export function AddressPickerMap({ value, onChange, focus, caption }: AddressPickerMapProps) {
  return (
    <MapContainer
      center={toLatLng(value ?? DEFAULT_CENTER)}
      zoom={value ? 16 : 13}
      className="map"
      scrollWheelZoom
    >
      <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />
      <ClickToPlace onPick={onChange} />
      <FlyTo target={focus} zoom={16} />
      {value && (
        <Marker
          position={toLatLng(value)}
          draggable
          eventHandlers={{
            dragend(event) {
              const { lat, lng } = (event.target as L.Marker).getLatLng()
              onChange({ lat, lng })
            },
          }}
        >
          {caption && (
            <Tooltip permanent direction="top" className="map__caption">
              {caption}
            </Tooltip>
          )}
        </Marker>
      )}
    </MapContainer>
  )
}

function FitAll({ points }: { points: Coordinates[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const bounds = L.latLngBounds(points.map(toLatLng))
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
  }, [map, points])
  return null
}

export function PinsOverviewMap({ pins }: { pins: MapPin[] }) {
  return (
    <MapContainer center={toLatLng(DEFAULT_CENTER)} zoom={11} className="map map--tall" scrollWheelZoom>
      <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />
      <FitAll points={pins} />
      {pins.map((pin) => (
        <Marker key={pin.id} position={toLatLng(pin)}>
          <Popup>
            <div className="map__popup">
              <strong>{pin.title}</strong>
              {pin.subtitle && <span>{pin.subtitle}</span>}
              <a
                className="btn btn--sm"
                href={wazeNavigationUrl(pin)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ir con Waze
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

const vertexIcon = L.divIcon({ className: 'map__vertex', iconSize: [16, 16] })

interface ZoneEditorMapProps {
  zone: Coordinates[]
  onChange: (zone: Coordinates[]) => void
}

/** Polígono con vértices arrastrables. Click en un vértice lo borra (si quedan más de 3). */
export function ZoneEditorMap({ zone, onChange }: ZoneEditorMapProps) {
  const move = (index: number, point: Coordinates) =>
    onChange(zone.map((vertex, i) => (i === index ? point : vertex)))
  const remove = (index: number) => {
    if (zone.length > 3) onChange(zone.filter((_, i) => i !== index))
  }

  return (
    <MapContainer center={toLatLng(DEFAULT_CENTER)} zoom={12} className="map map--tall" scrollWheelZoom>
      <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />
      <FitAll points={zone} />
      <Polygon
        positions={zone.map(toLatLng)}
        pathOptions={{ color: '#3ddc84', weight: 2, fillOpacity: 0.12 }}
        eventHandlers={{
          // Doble click sobre el polígono agrega un vértice ahí.
          dblclick(event) {
            L.DomEvent.stopPropagation(event)
            onChange([...zone, { lat: event.latlng.lat, lng: event.latlng.lng }])
          },
        }}
      />
      {zone.map((vertex, index) => (
        <Marker
          key={index}
          position={toLatLng(vertex)}
          icon={vertexIcon}
          draggable
          eventHandlers={{
            dragend(event) {
              const { lat, lng } = (event.target as L.Marker).getLatLng()
              move(index, { lat, lng })
            },
            dblclick(event) {
              L.DomEvent.stopPropagation(event)
              remove(index)
            },
          }}
        />
      ))}
    </MapContainer>
  )
}

/* ---------- reparto en vivo ---------- */

/** Encuadra una sola vez, cuando aparecen los primeros puntos: si no, cada posición nueva movería el mapa bajo el mouse del admin. */
function FitOnce({ points }: { points: Coordinates[] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length === 0) return
    done.current = true
    map.fitBounds(L.latLngBounds(points.map(toLatLng)), { padding: [40, 40], maxZoom: 15 })
  }, [map, points])
  return null
}

const ORDER_COLORS: Record<OrderStatus, string> = {
  pending: '#f0b429',
  assigned: '#5aa9ff',
  on_the_way: '#3ddc84',
  failed: '#ff6b5e',
  delivered: '#8a8f98',
  cancelled: '#8a8f98',
}

/**
 * El ícono del repartidor se arma con nodos del DOM y `textContent`, no con un
 * string de HTML: el nombre lo escribe cada usuario en su perfil.
 */
function courierIcon(name: string, stale: boolean): L.DivIcon {
  const element = document.createElement('div')
  element.className = `map__courier${stale ? ' is-stale' : ''}`
  element.textContent = initials(name)
  return L.divIcon({ html: element, className: '', iconSize: [30, 30], iconAnchor: [15, 15] })
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?').slice(0, 2)
}

const ago = (date: Date, now: Date): string => {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000))
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.round(minutes / 60)} h`
}

interface LiveDeliveryMapProps {
  couriers: readonly Courier[]
  orders: readonly LiveOrder[]
  now: Date
}

export function LiveDeliveryMap({ couriers, orders, now }: LiveDeliveryMapProps) {
  const placed = couriers.filter((courier) => courier.onShift && courier.position)
  const names = new Map(couriers.map((courier) => [courier.id, courier.displayName]))
  const points: Coordinates[] = [...orders, ...placed.map((courier) => courier.position!)]

  return (
    <MapContainer center={toLatLng(DEFAULT_CENTER)} zoom={12} className="map map--live" scrollWheelZoom>
      <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />
      <FitOnce points={points} />
      {orders.map((order) => (
        <CircleMarker
          key={order.id}
          center={toLatLng(order)}
          radius={8}
          pathOptions={{ color: '#05140b', weight: 2, fillColor: ORDER_COLORS[order.status], fillOpacity: 0.95 }}
        >
          <Popup>
            <div className="map__popup">
              <strong>{order.customerName || 'Cliente'}</strong>
              <span>{order.addressLabel || 'Sin referencia'}</span>
              <span>
                {ORDER_STATUS_LABEL[order.status]}
                {order.courierId ? ` · ${names.get(order.courierId) ?? 'repartidor'}` : ''}
              </span>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      {placed.map((courier) => {
        const position = courier.position!
        const stale = isStale(position, now)
        return (
          <Marker key={courier.id} position={toLatLng(position)} icon={courierIcon(courier.displayName, stale)} zIndexOffset={1000}>
            <Tooltip direction="top" offset={[0, -14]}>{courier.displayName}</Tooltip>
            <Popup>
              <div className="map__popup">
                <strong>{courier.displayName}</strong>
                <span>
                  {stale ? 'Sin señal · ' : ''}
                  {ago(position.recordedAt, now)}
                </span>
                {position.speedMps !== null && <span>{Math.round(position.speedMps * 3.6)} km/h</span>}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
