import { lazy, Suspense, type ComponentProps } from 'react'

// Leaflet pesa ~150 kB: se baja solo en las pantallas que muestran un mapa.
const Picker = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.AddressPickerMap })))
const Overview = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.AddressesOverviewMap })))

const fallback = <div className="skeleton map" aria-busy="true" />

export function LazyAddressPickerMap(props: ComponentProps<typeof Picker>) {
  return (
    <Suspense fallback={fallback}>
      <Picker {...props} />
    </Suspense>
  )
}

export function LazyAddressesOverviewMap(props: ComponentProps<typeof Overview>) {
  return (
    <Suspense fallback={<div className="skeleton map map--tall" aria-busy="true" />}>
      <Overview {...props} />
    </Suspense>
  )
}
