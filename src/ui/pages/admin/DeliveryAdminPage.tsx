import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MIN_ZONE_VERTICES, type DeliverySettings } from '../../../domain/order/Delivery'
import { formatPrice } from '../../../domain/order/Product'
import type { Coordinates } from '../../../domain/user/UserAddress'
import { useRepositories } from '../../providers/ContainerProvider'
import { useAsync } from '../../hooks/useAsync'
import { useAction } from '../../hooks/useAction'
import { LazyZoneEditorMap } from '../../components/map/lazy'

export function DeliveryAdminPage() {
  const { delivery } = useRepositories()
  const current = useAsync(() => delivery.get(), [delivery])

  const [feeInside, setFeeInside] = useState('')
  const [feeOutside, setFeeOutside] = useState('')
  const [zone, setZone] = useState<Coordinates[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!current.data) return
    setFeeInside(String(current.data.feeInside))
    setFeeOutside(String(current.data.feeOutside))
    setZone(current.data.zone)
  }, [current.data])

  const save = useAction(async () => {
    const next: DeliverySettings = { feeInside: Number(feeInside), feeOutside: Number(feeOutside), zone }
    current.setData(await delivery.update(next))
    setSaved(true)
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    void save.run()
  }

  const validFee = (value: string) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  const valid = validFee(feeInside) && validFee(feeOutside) && zone.length >= MIN_ZONE_VERTICES
  const dirty =
    !!current.data &&
    (String(current.data.feeInside) !== feeInside ||
      String(current.data.feeOutside) !== feeOutside ||
      JSON.stringify(current.data.zone) !== JSON.stringify(zone))

  return (
    <div className="container stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Envío</h1>
        <span className="spacer" />
        <Link to="/admin/pedidos" className="btn btn--ghost btn--sm">Pedidos</Link>
        <Link to="/admin" className="btn btn--ghost btn--sm">← Concursos</Link>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
        El costo se decide por la dirección del usuario: dentro del casco urbano paga un precio,
        fuera paga otro. Se calcula al confirmar el pedido y queda fijo aunque cambies los precios
        después.
      </p>

      {(current.error || save.error) && (
        <div className="alert alert--error">{current.error ?? save.error}</div>
      )}

      {current.loading ? (
        <div className="skeleton" style={{ height: '10rem' }} />
      ) : (
        <form className="stack" onSubmit={onSubmit}>
          <div className="card grid grid--2">
            <label className="field" style={{ margin: 0 }}>
              <span className="field__label">Dentro del casco (ARS)</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={feeInside}
                onChange={(e) => {
                  setFeeInside(e.target.value)
                  setSaved(false)
                }}
                required
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span className="field__label">Fuera del casco (ARS)</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={feeOutside}
                onChange={(e) => {
                  setFeeOutside(e.target.value)
                  setSaved(false)
                }}
                required
              />
            </label>
          </div>

          <section className="stack" style={{ gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Casco urbano</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
              Arrastrá los puntos verdes para ajustar el borde. Doble click sobre la zona agrega un
              punto; doble click sobre un punto lo saca. {zone.length} vértices.
            </p>
            <LazyZoneEditorMap
              zone={zone}
              onChange={(next) => {
                setZone(next)
                setSaved(false)
              }}
            />
          </section>

          {saved && !dirty && <div className="alert alert--ok">Configuración guardada.</div>}
          {dirty && <div className="alert alert--warn">Tenés cambios sin guardar.</div>}

          <div className="row">
            <button type="submit" className="btn" disabled={!valid || !dirty || save.pending}>
              {save.pending ? 'Guardando…' : 'Guardar'}
            </button>
            {current.data && (
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Ahora: {formatPrice(current.data.feeInside)} adentro · {formatPrice(current.data.feeOutside)} afuera
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
