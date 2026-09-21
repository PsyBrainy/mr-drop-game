import { useEffect, useState, type FormEvent } from 'react'
import type { Coordinates } from '../../domain/user/UserAddress'
import { formatCoordinates, MAX_ADDRESS_LABEL } from '../../domain/user/UserAddress'
import { useContainer, useRepositories } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import { useAction } from '../hooks/useAction'
import { LazyAddressPickerMap } from './map/lazy'

type Resolved =
  { status: 'idle' } | { status: 'loading' } | { status: 'done'; address: string | null }

export function AddressPicker() {
  const { addresses } = useRepositories()
  const { geocoder } = useContainer()
  const current = useAsync(() => addresses.getMine(), [addresses])

  const [point, setPoint] = useState<Coordinates | null>(null)
  const [label, setLabel] = useState('')
  const [focus, setFocus] = useState<Coordinates | null>(null)
  const [saved, setSaved] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Resolved>({ status: 'idle' })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!current.data) return
    setPoint({ lat: current.data.lat, lng: current.data.lng })
    setLabel(current.data.label)
  }, [current.data])

  // Nominatim pide máximo 1 request/segundo: se espera a que el pin se quede quieto.
  useEffect(() => {
    if (!point || !open) {
      setResolved({ status: 'idle' })
      return
    }
    setResolved({ status: 'loading' })
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      geocoder
        .reverse(point, controller.signal)
        .then((address) => setResolved({ status: 'done', address }))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setResolved({ status: 'done', address: null })
          void cause
        })
    }, 700)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [point, open, geocoder])

  const save = useAction(async () => {
    if (!point) return
    const result = await addresses.saveMine({ ...point, label })
    current.setData(result)
    setSaved(true)
  })

  const remove = useAction(async () => {
    await addresses.deleteMine()
    current.setData(null)
    setPoint(null)
    setLabel('')
    setSaved(false)
  })

  const place = (next: Coordinates) => {
    setPoint(next)
    setSaved(false)
  }

  const locateMe = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no permite obtener la ubicación.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const here = { lat: coords.latitude, lng: coords.longitude }
        place(here)
        setFocus(here)
      },
      () => setGeoError('No pudimos obtener tu ubicación. Marcá el punto en el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    void save.run()
  }

  const dirty =
    !!point &&
    (!current.data ||
      current.data.lat !== point.lat ||
      current.data.lng !== point.lng ||
      current.data.label !== label)

  const detected = resolved.status === 'done' ? resolved.address : null

  const summary = current.loading
    ? 'Cargando…'
    : current.data
      ? `Cargada${current.data.label ? ` · ${current.data.label}` : ''}`
      : 'Opcional · sin cargar'

  return (
    <div className="card stack">
      <button
        type="button"
        className="collapsible__toggle"
        aria-expanded={open}
        aria-controls="address-picker-body"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="stack" style={{ gap: '0.1rem' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Mi dirección</h2>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {summary}
          </span>
        </span>
        <span className={`collapsible__chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div id="address-picker-body" className="stack">
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Tocá el mapa o arrastrá el pin hasta tu puerta. Solo la ve el equipo de Mister Drop.
          </p>

          {(current.error || save.error || remove.error) && (
            <div className="alert alert--error">{current.error ?? save.error ?? remove.error}</div>
          )}
          {geoError && <div className="alert alert--warn">{geoError}</div>}

          {current.loading ? (
            <div className="skeleton map" />
          ) : (
            <LazyAddressPickerMap
              value={point}
              focus={focus}
              onChange={place}
              caption={resolved.status === 'loading' ? 'Buscando dirección…' : detected}
            />
          )}

          <div className={`pin-status ${point ? 'is-set' : ''}`} aria-live="polite">
            {!point ? (
              <>
                <strong>Todavía no marcaste tu dirección.</strong>
                <span className="muted">Tocá el mapa donde está tu puerta o usá tu ubicación.</span>
              </>
            ) : resolved.status === 'loading' ? (
              <>
                <strong>Pin colocado.</strong>
                <span className="muted">Buscando la dirección de ese punto…</span>
              </>
            ) : (
              <>
                <strong>{detected ?? 'Pin colocado.'}</strong>
                <span className="muted">
                  {detected
                    ? '¿Es tu dirección? Si no coincide, mové el pin.'
                    : 'No encontramos una dirección para ese punto. Igual podés guardarlo.'}
                  {' · '}
                  {formatCoordinates(point)}
                </span>
              </>
            )}
          </div>

          <form className="stack" onSubmit={onSubmit}>
            <div className="row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={locateMe}>
                Usar mi ubicación
              </button>
            </div>

            <label className="field">
              <span className="field__label">Referencia (piso, timbre, entre calles…)</span>
              <input
                className="input"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value)
                  setSaved(false)
                }}
                maxLength={MAX_ADDRESS_LABEL}
                placeholder="Ej: 3° B, timbre 12, portón negro"
              />
            </label>

            {saved && !dirty && <div className="alert alert--ok">Dirección guardada.</div>}
            {dirty && current.data && (
              <div className="alert alert--warn">Tenés cambios sin guardar.</div>
            )}

            <div className="row">
              <button type="submit" className="btn" disabled={!dirty || save.pending}>
                {save.pending
                  ? 'Guardando…'
                  : current.data
                    ? 'Guardar cambios'
                    : 'Guardar dirección'}
              </button>
              {current.data && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={remove.pending}
                  onClick={() => void remove.run()}
                >
                  Borrar dirección
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
