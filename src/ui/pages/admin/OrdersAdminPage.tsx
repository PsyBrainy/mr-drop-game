import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Leaf, Truck, ArrowLeft, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { OrderWithProfile } from '../../../application/ports/OrderRepository'
import { isRoundOpen, ORDER_STATUS_LABEL, type OrderRound, type OrderStatus } from '../../../domain/order/Order'
import { isAwaitingDelivery } from '../../../domain/order/OrderFlow'
import { formatPrice } from '../../../domain/order/Product'
import { wazeNavigationUrl } from '../../../domain/user/UserAddress'
import { useRepositories } from '../../providers/ContainerProvider'
import { useConfirm } from '../../providers/ConfirmProvider'
import { useOpenRound } from '../../providers/OrderRoundProvider'
import { useAsync } from '../../hooks/useAsync'
import { useAction } from '../../hooks/useAction'
import { Avatar } from '../../components/Avatar'
import { LazyPinsOverviewMap } from '../../components/map/lazy'

const dateFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export function OrdersAdminPage() {
  const { orders } = useRepositories()
  const { refresh: refreshOpenRound } = useOpenRound()
  const rounds = useAsync(() => orders.listRounds(), [orders])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const list = rounds.data ?? []
  const open = list.find(isRoundOpen) ?? null

  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId((open ?? list[0]!).id)
  }, [list, open, selectedId])

  const selected = list.find((round) => round.id === selectedId) ?? null

  return (
    <div className="container stack">
      <div className="row admin-header">
        <h1 style={{ margin: 0 }}>Pedidos</h1>
        <span className="spacer" />
        <Link to="/admin/reparto" className="btn btn--ghost btn--sm">
          <MapPin className="admin-tab-icon" size={18} />
          <span className="admin-tab-text">Reparto en vivo</span>
        </Link>
        <Link to="/admin/combos" className="btn btn--ghost btn--sm">
          <Leaf className="admin-tab-icon" size={18} />
          <span className="admin-tab-text">Combos</span>
        </Link>
        <Link to="/admin/envio" className="btn btn--ghost btn--sm">
          <Truck className="admin-tab-icon" size={18} />
          <span className="admin-tab-text">Envío</span>
        </Link>
        <Link to="/admin" className="btn btn--ghost btn--sm">
          <ArrowLeft className="admin-tab-icon" size={18} />
          <span className="admin-tab-text">← Concursos</span>
        </Link>
      </div>

      {rounds.error && <div className="alert alert--error">{rounds.error}</div>}

      <RoundControl
        open={open}
        onChanged={(id) => {
          if (id) setSelectedId(id)
          rounds.reload()
          void refreshOpenRound()
        }}
      />

      {list.length > 1 && (
        <div className="row">
          <span className="muted" style={{ fontSize: '0.85rem' }}>Camada:</span>
          {list.map((round) => (
            <button
              key={round.id}
              type="button"
              className={`btn btn--sm ${round.id === selectedId ? '' : 'btn--ghost'}`}
              onClick={() => setSelectedId(round.id)}
            >
              {roundLabel(round)}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <RoundOrders
          key={selected.id}
          round={selected}
          onDeleted={() => {
            setSelectedId(null)
            rounds.reload()
            void refreshOpenRound()
          }}
        />
      )}
      {!rounds.loading && list.length === 0 && (
        <div className="empty-state">Todavía no abriste ninguna camada de pedidos.</div>
      )}
    </div>
  )
}

function roundLabel(round: OrderRound): string {
  return round.name || dateFormat.format(round.openedAt)
}

function RoundControl({ open, onChanged }: { open: OrderRound | null; onChanged: (id?: string) => void }) {
  const { orders } = useRepositories()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)

  const code = useAsync(() => (open ? orders.getRoundCode(open.id) : Promise.resolve(null)), [open, orders])

  const openRound = useAction(async () => {
    const result = await orders.openRound(name)
    setName('')
    onChanged(result.roundId)
  })

  const closeRound = useAction(async () => {
    if (!open) return
    await orders.closeRound(open.id)
    onChanged()
  })

  const copy = async () => {
    if (!code.data) return
    await navigator.clipboard.writeText(code.data)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void openRound.run()
  }

  if (open) {
    return (
      <section className="card stack">
        <div className="row">
          <span className="badge badge--live">Pedidos abiertos</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            desde {dateFormat.format(open.openedAt)}
          </span>
        </div>
        {open.name && <h2 style={{ margin: 0 }}>{open.name}</h2>}
        {(code.error || closeRound.error) && (
          <div className="alert alert--error">{code.error ?? closeRound.error}</div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          Compartí este código: es el mismo para todos. Cada usuario lo ingresa en{' '}
          <span className="code-pill">{window.location.origin}/pedidos</span> y recién ahí puede pedir.
        </p>
        <div className="row">
          <span className="code-pill" style={{ fontSize: '1.4rem', letterSpacing: '0.15em' }}>
            {code.loading ? '……' : (code.data ?? '—')}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy()} disabled={!code.data}>
            {copied ? '¡Copiado!' : 'Copiar código'}
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--danger btn--sm"
            disabled={closeRound.pending}
            onClick={async () => {
              const ok = await confirm({
                title: '¿Cerrar los pedidos?',
                message: 'Los usuarios ya no van a poder pedir ni cambiar el suyo. Después no se puede reabrir.',
                confirmLabel: 'Cerrar pedidos',
                danger: true,
              })
              if (ok) void closeRound.run()
            }}
          >
            {closeRound.pending ? 'Cerrando…' : 'Cerrar pedidos'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <div className="row">
        <span className="badge badge--closed">Pedidos cerrados</span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
        Al abrir una camada se genera un código para repartir. Los usuarios que lo ingresen
        van a poder armar su pedido hasta que la cierres.
      </p>
      {openRound.error && <div className="alert alert--error">{openRound.error}</div>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ margin: 0, flex: '1 1 200px' }}>
          <span className="field__label">Nombre (opcional)</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ej: Camada de octubre"
          />
        </label>
        <button type="submit" className="btn" disabled={openRound.pending}>
          {openRound.pending ? 'Abriendo…' : 'Abrir pedidos'}
        </button>
      </div>
    </form>
  )
}

type Filter = 'pending' | 'delivered' | 'cancelled' | 'all'

function RoundOrders({ round, onDeleted }: { round: OrderRound; onDeleted: () => void }) {
  const { orders } = useRepositories()
  const confirm = useConfirm()
  const list = useAsync(() => orders.listForRound(round.id), [round.id, orders])
  const [filter, setFilter] = useState<Filter>('pending')

  const removeRound = useAction(async () => {
    await orders.deleteRound(round.id)
    onDeleted()
  })

  const deleteRound = async () => {
    const count = (list.data ?? []).length
    const ok = await confirm({
      title: `¿Borrar la camada "${roundLabel(round)}"?`,
      message:
        count > 0
          ? `Se borran también sus ${count} pedido${count === 1 ? '' : 's'} y el código. Esto no se puede deshacer.`
          : 'Se borra la camada y su código. Esto no se puede deshacer.',
      confirmLabel: 'Borrar camada',
      danger: true,
    })
    if (ok) void removeRound.run()
  }

  const setStatus = useAction(async (orderId: string, status: OrderStatus) => {
    await orders.setStatus(orderId, status)
    list.reload()
  })

  const remove = useAction(async (orderId: string) => {
    await orders.delete(orderId)
    list.reload()
  })

  const cancelOrder = async (order: OrderWithProfile) => {
    const ok = await confirm({
      title: `¿Cancelar el pedido de ${order.displayName}?`,
      message: 'Queda en la lista como cancelado y se puede reactivar.',
      confirmLabel: 'Cancelar pedido',
      danger: true,
    })
    if (ok) void setStatus.run(order.id, 'cancelled')
  }

  const deleteOrder = async (order: OrderWithProfile) => {
    const ok = await confirm({
      title: `¿Borrar el pedido de ${order.displayName}?`,
      message: 'Se borra del todo, con sus items. Esto no se puede deshacer.',
      confirmLabel: 'Borrar pedido',
      danger: true,
    })
    if (ok) void remove.run(order.id)
  }

  const everything = list.data ?? []
  const all = useMemo(() => everything.filter((order) => order.status !== 'cancelled'), [everything])
  // "Pendientes" es todo lo que todavía hay que resolver: sin salir, en camino,
  // o que no se pudo entregar y espera que el admin decida.
  const pending = all.filter((order) => needsDelivery(order.status))
  const delivered = all.filter((order) => order.status === 'delivered')
  const cancelled = everything.filter((order) => order.status === 'cancelled')
  const visible =
    filter === 'all' ? everything : filter === 'pending' ? pending : filter === 'delivered' ? delivered : cancelled

  const summary = useMemo(() => {
    const byName = new Map<string, number>()
    for (const order of pending) {
      for (const item of order.items) byName.set(item.name, (byName.get(item.name) ?? 0) + item.quantity)
    }
    return [...byName.entries()].sort((a, b) => b[1] - a[1])
  }, [pending])

  const revenue = all.reduce((sum, order) => sum + order.total, 0)

  return (
    <>
      <section className="card stack">
        <div className="row">
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{roundLabel(round)}</h2>
          {isRoundOpen(round) ? (
            <span className="badge badge--live">abierta</span>
          ) : (
            <span className="badge badge--closed">cerrada</span>
          )}
          <span className="spacer" />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {pending.length} pendientes · {delivered.length} entregados · {formatPrice(revenue)}
          </span>
          <button type="button" className="btn btn--danger btn--sm" disabled={removeRound.pending} onClick={() => void deleteRound()}>
            Borrar camada
          </button>
        </div>
        {removeRound.error && <div className="alert alert--error">{removeRound.error}</div>}
        {summary.length > 0 && (
          <div className="row" style={{ gap: '0.4rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>Para preparar:</span>
            {summary.map(([name, quantity]) => (
              <span key={name} className="code-pill">{quantity}× {name}</span>
            ))}
          </div>
        )}
      </section>

      {list.error && <div className="alert alert--error">{list.error}</div>}
      {(setStatus.error || remove.error) && (
        <div className="alert alert--error">{setStatus.error ?? remove.error}</div>
      )}

      {list.loading ? (
        <div className="skeleton" style={{ height: '8rem' }} />
      ) : everything.length === 0 ? (
        <div className="empty-state">Todavía no hay pedidos en esta camada.</div>
      ) : (
        <>
          {pending.length > 0 && (
            <LazyPinsOverviewMap
              pins={pending.map((order) => ({
                id: order.id,
                lat: order.lat,
                lng: order.lng,
                title: order.displayName,
                subtitle: [order.addressLabel, itemsSummary(order)].filter(Boolean).join(' · '),
              }))}
            />
          )}

          <div className="row">
            {(
              [
                ['pending', `Pendientes (${pending.length})`],
                ['delivered', `Entregados (${delivered.length})`],
                ['cancelled', `Cancelados (${cancelled.length})`],
                ['all', 'Todos'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn btn--sm ${filter === value ? '' : 'btn--ghost'}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="stack">
            {visible.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                busy={setStatus.pending || remove.pending}
                onStatus={(status) => void setStatus.run(order.id, status)}
                onCancel={() => void cancelOrder(order)}
                onDelete={() => void deleteOrder(order)}
              />
            ))}
            {visible.length === 0 && <div className="empty-state">Nada por acá.</div>}
          </div>
        </>
      )}
    </>
  )
}

function itemsSummary(order: OrderWithProfile): string {
  return order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')
}

function OrderCard({
  order,
  busy,
  onStatus,
  onCancel,
  onDelete,
}: {
  order: OrderWithProfile
  busy: boolean
  onStatus: (status: OrderStatus) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const delivered = order.status === 'delivered'
  const cancelled = order.status === 'cancelled'
  return (
    <div className="card stack" style={{ gap: '0.6rem', opacity: delivered || cancelled ? 0.7 : 1 }}>
      <div className="row">
        <div className="board__player">
          <Avatar displayName={order.displayName} avatarUrl={order.avatarUrl} />
          <strong>{order.displayName}</strong>
        </div>
        <span className={`badge ${isAwaitingDelivery(order.status) ? 'badge--live' : 'badge--closed'}`}>
          {ORDER_STATUS_LABEL[order.status]}
        </span>
        <span className="spacer" />
        <strong style={{ color: 'var(--accent)' }}>{formatPrice(order.total)}</strong>
      </div>

      <div style={{ fontSize: '0.92rem', textDecoration: cancelled ? 'line-through' : 'none' }}>
        {itemsSummary(order)}
      </div>

      <div className="muted" style={{ fontSize: '0.85rem' }}>
        {order.deliveryInside !== null && (
          <>
            {order.deliveryInside ? 'Casco urbano' : 'Fuera del casco'} · envío {formatPrice(order.deliveryFee)} ·{' '}
          </>
        )}
        {order.addressLabel || 'Sin referencia'} · pedido {dateFormat.format(order.createdAt)}
        {order.deliveredAt && ` · entregado ${dateFormat.format(order.deliveredAt)}`}
      </div>
      {order.notes && (
        <div className="alert alert--warn" style={{ fontSize: '0.88rem' }}>Nota: {order.notes}</div>
      )}

      <div className="row">
        {!cancelled && (
          <a className="btn btn--sm" href={wazeNavigationUrl(order)} target="_blank" rel="noopener noreferrer">
            Waze
          </a>
        )}
        {needsDelivery(order.status) && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onStatus('delivered')}>
            Marcar entregado
          </button>
        )}
        {(delivered || cancelled || order.status === 'failed') && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onStatus('pending')}>
            {delivered ? 'Volver a pendiente' : cancelled ? 'Reactivar' : 'Volver a la bolsa'}
          </button>
        )}
        <span className="spacer" />
        {!cancelled && (
          <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={onDelete}>
          Borrar
        </button>
      </div>
    </div>
  )
}

function needsDelivery(status: OrderStatus): boolean {
  return isAwaitingDelivery(status) || status === 'failed'
}
