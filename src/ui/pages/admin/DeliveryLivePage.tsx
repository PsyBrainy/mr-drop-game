import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  courierLoad,
  groupOrders,
  isStale,
  type Courier,
  type LiveOrder,
} from '../../../domain/delivery/LiveDelivery'
import { ORDER_STATUS_LABEL } from '../../../domain/order/Order'
import { formatPrice } from '../../../domain/order/Product'
import { wazeNavigationUrl } from '../../../domain/user/UserAddress'
import type { ConsoleView, DeliveryConsole } from '../../../application/usecases/DeliveryConsole'
import { useDeliveryConsole } from '../../hooks/useDeliveryConsole'
import { LazyLiveDeliveryMap } from '../../components/map/lazy'

/**
 * El reparto en vivo: dónde está cada repartidor, qué lleva, y asignar.
 *
 * Todo llega por `/ws/delivery` (psy-ws), no por Supabase: el panel se entera
 * de cada cambio por los avisos de la base (NOTIFY) que psy-ws reparte.
 */
export function DeliveryLivePage() {
  const { view, console, configured } = useDeliveryConsole()
  const now = useNow(15_000)

  return (
    <div className="container stack">
      <div className="row admin-header">
        <h1 style={{ margin: 0 }}>Reparto en vivo</h1>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={console.refresh} disabled={view.link !== 'online'}>
          <RefreshCw size={16} /> Actualizar
        </button>
        <Link to="/admin/pedidos" className="btn btn--ghost btn--sm">
          <ArrowLeft size={16} /> Pedidos
        </Link>
      </div>

      {!configured ? (
        <div className="alert alert--warn">
          Falta configurar el servidor de reparto: <span className="code-pill">VITE_DELIVERY_WS_URL</span> (o{' '}
          <span className="code-pill">VITE_FIGHT_WS_URL</span>, de la que se deriva).
        </div>
      ) : view.denied ? (
        <div className="alert alert--error">{view.denied.message}</div>
      ) : (
        <LiveBody view={view} console={console} now={now} />
      )}
    </div>
  )
}

function LiveBody({ view, console, now }: { view: ConsoleView; console: DeliveryConsole; now: Date }) {
  const groups = useMemo(() => groupOrders(view.orders), [view.orders])
  const couriers = useMemo(
    () =>
      [...view.couriers].sort(
        (a, b) => Number(b.onShift) - Number(a.onShift) || a.displayName.localeCompare(b.displayName, 'es'),
      ),
    [view.couriers],
  )

  return (
    <>
      {view.link !== 'online' && (
        <div className="alert alert--warn">
          {view.link === 'connecting' ? 'Conectando con el servidor de reparto…' : 'Sin conexión. Reintentando…'}
          {view.linkDetail && <span className="muted"> ({view.linkDetail})</span>}
        </div>
      )}

      {!view.loaded ? (
        <div className="skeleton map map--live" aria-busy="true" />
      ) : (
        <div className="live-grid">
          <LazyLiveDeliveryMap couriers={view.couriers} orders={view.orders} now={now} />
          <CourierList couriers={couriers} orders={view.orders} now={now} />
        </div>
      )}

      {view.loaded && view.orders.length === 0 && (
        <div className="empty-state">
          No hay pedidos para repartir. Aparecen acá cuando cerrás una camada.
        </div>
      )}

      <OrderSection title="No entregados" hint="Resolvé: reasigná o devolvé a la bolsa." orders={groups.failed} couriers={couriers} console={console} online={view.link === 'online'} />
      <OrderSection title="En la bolsa" hint="Los toma un repartidor desde la app, o asignalos acá." orders={groups.pool} couriers={couriers} console={console} online={view.link === 'online'} />
      <OrderSection title="Asignados" orders={groups.assigned} couriers={couriers} console={console} online={view.link === 'online'} />
      <OrderSection title="En camino" orders={groups.onTheWay} couriers={couriers} console={console} online={view.link === 'online'} />
    </>
  )
}

function CourierList({ couriers, orders, now }: { couriers: Courier[]; orders: readonly LiveOrder[]; now: Date }) {
  return (
    <section className="card stack" style={{ gap: '0.6rem' }}>
      <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Repartidores</h2>
      {couriers.length === 0 && (
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          Nadie tiene rol de repartidor todavía. Se asigna en Supabase:{' '}
          <span className="code-pill">profiles.role = 'courier'</span>.
        </p>
      )}
      {couriers.map((courier) => {
        const load = courierLoad(orders, courier.id)
        const position = courier.position
        const stale = position ? isStale(position, now) : false
        return (
          <div key={courier.id} className="row" style={{ gap: '0.5rem' }}>
            <span className={`status-dot ${courier.onShift && position && !stale ? 'status-dot--on_the_way' : 'status-dot--off'}`} />
            <strong style={{ fontSize: '0.95rem' }}>{courier.displayName}</strong>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              {!courier.onShift
                ? 'fuera de turno'
                : !position
                  ? 'en turno, sin ubicación'
                  : stale
                    ? 'sin señal'
                    : 'en turno'}
              {load > 0 && ` · ${load} pedido${load === 1 ? '' : 's'}`}
            </span>
          </div>
        )
      })}
    </section>
  )
}

function OrderSection({
  title,
  hint,
  orders,
  couriers,
  console,
  online,
}: {
  title: string
  hint?: string
  orders: LiveOrder[]
  couriers: Courier[]
  console: DeliveryConsole
  online: boolean
}) {
  if (orders.length === 0) return null
  return (
    <section className="stack" style={{ gap: '0.6rem' }}>
      <div className="row">
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
          {title} ({orders.length})
        </h2>
        {hint && <span className="muted" style={{ fontSize: '0.85rem' }}>{hint}</span>}
      </div>
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} couriers={couriers} console={console} online={online} />
      ))}
    </section>
  )
}

function OrderRow({
  order,
  couriers,
  console,
  online,
}: {
  order: LiveOrder
  couriers: Courier[]
  console: DeliveryConsole
  online: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // En camino ya salió: sacárselo es una corrección que se hace desde Pedidos.
  const assignable = order.status !== 'on_the_way'
  const courierName = couriers.find((courier) => courier.id === order.courierId)?.displayName

  const assign = async (courierId: string | null) => {
    setPending(true)
    setError(null)
    const outcome = await console.assign(order.id, courierId)
    setPending(false)
    if (!outcome.ok) setError(outcome.message)
  }

  return (
    <div className="card stack" style={{ gap: '0.5rem' }}>
      <div className="row">
        <span className={`status-dot status-dot--${order.status}`} />
        <strong>{order.customerName || 'Cliente'}</strong>
        <span className="badge">{ORDER_STATUS_LABEL[order.status]}</span>
        <span className="spacer" />
        <strong style={{ color: 'var(--accent)' }}>{formatPrice(Number(order.total))}</strong>
      </div>
      <div className="muted" style={{ fontSize: '0.88rem' }}>
        {order.addressLabel || 'Sin referencia'} · {order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}
      </div>
      {order.notes && <div className="alert alert--warn" style={{ fontSize: '0.85rem' }}>Nota: {order.notes}</div>}
      <div className="row">
        {assignable ? (
          <label className="row" style={{ gap: '0.4rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>Repartidor:</span>
            <select
              className="select"
              value={order.courierId ?? ''}
              disabled={!online || pending}
              onChange={(event) => void assign(event.target.value || null)}
            >
              <option value="">— En la bolsa —</option>
              {couriers.map((courier) => (
                <option key={courier.id} value={courier.id}>
                  {courier.displayName}
                  {courier.onShift ? '' : ' (fuera de turno)'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="muted" style={{ fontSize: '0.85rem' }}>Lo lleva {courierName ?? 'un repartidor'}</span>
        )}
        <span className="spacer" />
        <a className="btn btn--ghost btn--sm" href={wazeNavigationUrl(order)} target="_blank" rel="noopener noreferrer">
          Waze
        </a>
      </div>
      {error && <div className="alert alert--error">{error}</div>}
    </div>
  )
}

/** La hora, renovada cada `everyMs`: para "hace 30 s" y para apagar marcadores sin señal. */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
