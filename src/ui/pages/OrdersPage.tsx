import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  draftTotal,
  MAX_ITEM_QUANTITY,
  MAX_ORDER_NOTES,
  ORDER_STATUS_LABEL,
  type Order,
  type OrderDraftLine,
  type OrderRound,
} from '../../domain/order/Order'
import { formatPrice, type Product } from '../../domain/order/Product'
import { quoteDelivery } from '../../domain/order/Delivery'
import type { UserAddress } from '../../domain/user/UserAddress'
import { AddressPicker } from '../components/AddressPicker'
import { useRepositories } from '../providers/ContainerProvider'
import { useConfirm } from '../providers/ConfirmProvider'
import { useOpenRound } from '../providers/OrderRoundProvider'
import { PageSpinner } from '../components/ProtectedRoute'
import { useAsync } from '../hooks/useAsync'
import { useAction } from '../hooks/useAction'
import { analytics, type AnalyticsItem } from '../../infrastructure/analytics'

/** Los combos se venden en pesos. */
const CURRENCY = 'ARS'

const dateFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' })

export function OrdersPage() {
  const { orders } = useRepositories()
  const { openRound, loading } = useOpenRound()
  const history = useAsync(() => orders.listMyOrders(), [orders])
  const previous = (history.data ?? []).filter((order) => order.roundId !== openRound?.id)

  if (loading) return <PageSpinner />
  // Sin camada abierta los pedidos no existen para el usuario.
  if (!openRound) return <Navigate to="/" replace />

  return (
    <div className="container stack">
      <h1>Pedidos</h1>

      <OpenRound round={openRound} onOrderChanged={() => history.reload()} />

      {previous.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: '1.2rem' }}>Mis pedidos anteriores</h2>
          {previous.map((order) => (
            <OrderSummary key={order.id} order={order} />
          ))}
        </section>
      )}
    </div>
  )
}

function OpenRound({ round, onOrderChanged }: { round: OrderRound; onOrderChanged: () => void }) {
  const { orders } = useRepositories()
  const membership = useAsync(() => orders.isMemberOf(round.id), [round.id, orders])

  if (membership.loading) return <div className="skeleton" style={{ height: '8rem' }} />
  if (membership.error) return <div className="alert alert--error">{membership.error}</div>
  if (!membership.data) return <JoinForm round={round} onJoined={() => membership.reload()} />
  return <OrderBuilder round={round} onOrderChanged={onOrderChanged} />
}

function JoinForm({ round, onJoined }: { round: OrderRound; onJoined: () => void }) {
  const { orders } = useRepositories()
  const [code, setCode] = useState('')

  const join = useAction(async () => {
    await orders.joinRound(code)
    // El código no se manda: es la llave de la camada.
    analytics.track('order_round_join', { round: round.name || round.id })
    onJoined()
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void join.run()
  }

  return (
    <form className="card card--pad-lg stack" onSubmit={onSubmit}>
      <div className="row">
        <span className="badge badge--live">Pedidos abiertos</span>
        {round.name && <span className="muted">{round.name}</span>}
      </div>
      <h2 style={{ margin: 0 }}>Ingresá el código</h2>
      <p className="muted" style={{ margin: 0 }}>
        Mister Drop comparte un código para esta camada. Ponelo acá y armá tu pedido.
      </p>
      {join.error && <div className="alert alert--error">{join.error}</div>}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <input
          className="input input--code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CÓDIGO"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={12}
          required
          style={{ flex: '1 1 160px' }}
        />
        <button type="submit" className="btn" disabled={join.pending || code.trim().length < 4}>
          {join.pending ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </form>
  )
}

function OrderBuilder({ round, onOrderChanged }: { round: OrderRound; onOrderChanged: () => void }) {
  const { orders, products, delivery } = useRepositories()
  const confirm = useConfirm()
  const catalog = useAsync(() => products.list(), [products])
  const mine = useAsync(() => orders.getMyOrder(round.id), [round.id, orders])
  const shipping = useAsync(() => delivery.get(), [delivery])
  // La carga la hace el AddressPicker; acá solo se refleja lo último que guardó.
  const [address, setAddress] = useState<UserAddress | null | undefined>(undefined)

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!mine.data || mine.data.status === 'cancelled') return
    const next: Record<string, number> = {}
    for (const item of mine.data.items) if (item.productId) next[item.productId] = item.quantity
    setQuantities(next)
    setNotes(mine.data.notes)
  }, [mine.data])

  // Vio los combos: `view_item_list` es el primer paso del embudo de compra en GA.
  useEffect(() => {
    if (!catalog.data || catalog.data.length === 0) return
    analytics.track('view_item_list', {
      item_list_name: 'Combos',
      items: catalog.data.map((product, index) => ({
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        index,
      })),
    })
  }, [catalog.data])

  const lines = useMemo<OrderDraftLine[]>(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
    [quantities],
  )
  const prices = useMemo(
    () => new Map((catalog.data ?? []).map((product) => [product.id, product.price])),
    [catalog.data],
  )
  const subtotal = draftTotal(lines, prices)
  const quote = address && shipping.data ? quoteDelivery(address, shipping.data) : null
  const total = subtotal + (quote?.fee ?? 0)

  const place = useAction(async () => {
    const editing = current !== null
    const order = await orders.placeOrder(lines, notes)
    // Los eventos de comercio de GA: con `purchase` salen los ingresos, los
    // combos más pedidos y el ticket promedio. Editar un pedido que ya estaba
    // no es otra compra.
    analytics.track(editing ? 'order_update' : 'purchase', {
      transaction_id: order.id,
      value: order.total,
      shipping: order.deliveryFee,
      currency: CURRENCY,
      delivery_inside: order.deliveryInside ?? undefined,
      items: order.items.map(
        (item): AnalyticsItem => ({
          item_id: item.productId ?? item.name,
          item_name: item.name,
          price: item.unitPrice,
          quantity: item.quantity,
        }),
      ),
    })
    mine.setData(order)
    setSaved(true)
    onOrderChanged()
  })

  const cancel = useAction(async () => {
    const order = await orders.cancelMyOrder()
    analytics.track('order_cancel', { transaction_id: order.id, value: order.total, currency: CURRENCY })
    mine.setData(order)
    setQuantities({})
    setNotes('')
    setSaved(false)
    onOrderChanged()
  })

  const setQuantity = (productId: string, quantity: number) => {
    setSaved(false)
    const next = Math.max(0, Math.min(MAX_ITEM_QUANTITY, quantity))
    const delta = next - (quantities[productId] ?? 0)
    const product = (catalog.data ?? []).find((item) => item.id === productId)
    if (delta !== 0 && product) {
      analytics.track(delta > 0 ? 'add_to_cart' : 'remove_from_cart', {
        currency: CURRENCY,
        value: product.price * Math.abs(delta),
        items: [{ item_id: product.id, item_name: product.name, price: product.price, quantity: Math.abs(delta) }],
      })
    }
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, Math.min(MAX_ITEM_QUANTITY, quantity)),
    }))
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void place.run()
  }

  const current = mine.data && mine.data.status !== 'cancelled' ? mine.data : null
  const delivered = current?.status === 'delivered'
  const loading = catalog.loading || mine.loading || shipping.loading || address === undefined
  const noAddress = address === null
  // El pedido guarda una copia de la dirección: si cambió después, hay que reenviarlo.
  const addressMoved =
    !!current &&
    !!address &&
    !delivered &&
    (current.lat !== address.lat || current.lng !== address.lng || current.addressLabel !== address.label)

  return (
    <div className="stack">
      <div className="row">
        <span className="badge badge--live">Pedidos abiertos</span>
        {round.name && <span className="muted">{round.name}</span>}
      </div>

      <AddressPicker
        title="Dirección de entrega"
        emptyHint="Falta cargarla · sin dirección no se puede pedir"
        openWhenEmpty
        onChange={setAddress}
      />

      {noAddress && (
        <div className="alert alert--warn">
          Marcá tu dirección en el mapa de arriba para poder pedir.
        </div>
      )}
      {addressMoved && (
        <div className="alert alert--warn">
          Cambiaste la dirección después de pedir. Tocá <strong>Actualizar pedido</strong> para que
          se entregue en la nueva.
        </div>
      )}

      {current && (
        <div className="alert alert--ok">
          <strong>Tu pedido está {ORDER_STATUS_LABEL[current.status].toLowerCase()}.</strong>{' '}
          {delivered
            ? 'Gracias por pedir.'
            : 'Podés cambiarlo o cancelarlo mientras los pedidos sigan abiertos.'}
        </div>
      )}

      {(catalog.error || mine.error || shipping.error || place.error || cancel.error) && (
        <div className="alert alert--error">
          {catalog.error ?? mine.error ?? shipping.error ?? place.error ?? cancel.error}
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: '10rem' }} />
      ) : (catalog.data ?? []).length === 0 ? (
        <div className="empty-state">Todavía no hay combos cargados. Volvé en un rato.</div>
      ) : (
        <form className="stack" onSubmit={onSubmit}>
          <div className="stack" style={{ gap: '0.6rem' }}>
            {(catalog.data ?? []).map((product) => (
              <ProductLine
                key={product.id}
                product={product}
                quantity={quantities[product.id] ?? 0}
                disabled={delivered}
                onChange={(quantity) => setQuantity(product.id, quantity)}
              />
            ))}
          </div>

          <label className="field">
            <span className="field__label">Aclaraciones (opcional)</span>
            <textarea
              className="textarea"
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setSaved(false)
              }}
              maxLength={MAX_ORDER_NOTES}
              disabled={delivered}
              placeholder="Horario, timbre, lo que haga falta."
            />
          </label>

          <div className="card stack" style={{ gap: '0.4rem' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Combos</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">
                Envío{quote ? ` · ${quote.inside ? 'dentro' : 'fuera'} del casco urbano` : ''}
              </span>
              <span>{quote ? formatPrice(quote.fee) : '—'}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--surface-border)', paddingTop: '0.5rem' }}>
              <strong>Total</strong>
              <strong style={{ fontSize: '1.3rem', color: 'var(--accent)' }}>{formatPrice(total)}</strong>
            </div>
          </div>

          {saved && <div className="alert alert--ok">Pedido guardado.</div>}

          {!delivered && (
            <div className="row">
              <button
                type="submit"
                className="btn"
                disabled={place.pending || lines.length === 0 || !address}
              >
                {place.pending ? 'Enviando…' : current ? 'Actualizar pedido' : 'Confirmar pedido'}
              </button>
              {current && (
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={cancel.pending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: '¿Cancelar tu pedido?',
                      message: 'Podés volver a armarlo mientras los pedidos sigan abiertos.',
                      confirmLabel: 'Cancelar pedido',
                      danger: true,
                    })
                    if (ok) void cancel.run()
                  }}
                >
                  Cancelar pedido
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  )
}

function ProductLine({
  product,
  quantity,
  disabled,
  onChange,
}: {
  product: Product
  quantity: number
  disabled: boolean
  onChange: (quantity: number) => void
}) {
  return (
    <div className={`card toggle-row ${quantity > 0 ? 'is-selected' : ''}`}>
      <div className="toggle-row__info">
        <div className="toggle-row__name">
          {product.name} <span className="event-card__prize">{formatPrice(product.price)}</span>
        </div>
        {product.description && (
          <div className="muted" style={{ fontSize: '0.85rem' }}>{product.description}</div>
        )}
      </div>
      <div className="stepper" aria-label={`Cantidad de ${product.name}`}>
        <button type="button" className="stepper__btn" disabled={disabled || quantity === 0} onClick={() => onChange(quantity - 1)} aria-label="Sacar uno">
          −
        </button>
        <span className="stepper__value">{quantity}</span>
        <button type="button" className="stepper__btn" disabled={disabled || quantity >= MAX_ITEM_QUANTITY} onClick={() => onChange(quantity + 1)} aria-label="Agregar uno">
          +
        </button>
      </div>
    </div>
  )
}

function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="card stack" style={{ gap: '0.4rem' }}>
      <div className="row">
        <span className="muted" style={{ fontSize: '0.85rem' }}>{dateFormat.format(order.createdAt)}</span>
        <span className={`badge ${order.status === 'delivered' ? 'badge--closed' : 'badge--live'}`}>
          {ORDER_STATUS_LABEL[order.status]}
        </span>
        <span className="spacer" />
        <strong>{formatPrice(order.total)}</strong>
      </div>
      <div style={{ fontSize: '0.92rem' }}>
        {order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}
        {order.deliveryFee > 0 && (
          <span className="muted"> · envío {formatPrice(order.deliveryFee)}</span>
        )}
      </div>
    </div>
  )
}
