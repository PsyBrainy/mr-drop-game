import type { OrderStatus } from '../order/Order'

/**
 * El reparto en vivo, visto desde el panel del admin.
 *
 * Todo llega por `/ws/delivery` (psy-ws). El estado de la pantalla sale sólo de
 * `reduceLive(estado, mensaje)`: una función pura, para poder probar "qué ve el
 * admin después de tal secuencia de avisos" sin socket ni React.
 *
 * El panel no decide nada: pide (asignar, devolver a la bolsa) y la base decide.
 * La lista cambia por el aviso que llega después, no por el `ack`.
 */

export interface LiveOrderItem {
  readonly name: string
  readonly quantity: number
}

export interface LiveOrder {
  readonly id: string
  readonly roundId: string
  readonly status: OrderStatus
  readonly courierId: string | null
  readonly customerName: string
  readonly addressLabel: string
  readonly lat: number
  readonly lng: number
  readonly notes: string
  /** Plata como texto, tal cual la calculó la base. */
  readonly total: string
  readonly deliveryFee: string
  readonly items: readonly LiveOrderItem[]
  readonly statusChangedAt: Date
}

export interface CourierPosition {
  readonly courierId: string
  readonly lat: number
  readonly lng: number
  readonly accuracyM: number | null
  readonly headingDeg: number | null
  readonly speedMps: number | null
  /** Hora del celular al tomarla (el servidor no deja que venga del futuro). */
  readonly recordedAt: Date
}

export interface Courier {
  readonly id: string
  readonly displayName: string
  readonly onShift: boolean
  readonly position: CourierPosition | null
}

/** Los mensajes de `/ws/delivery` que le importan al panel. El cable lo traduce `infrastructure/delivery/protocol.ts`. */
export type LiveMessage =
  | { readonly type: 'welcome'; readonly userId: string; readonly role: string }
  | { readonly type: 'ack'; readonly requestId: string | null }
  | { readonly type: 'error'; readonly requestId: string | null; readonly code: string; readonly message: string }
  | {
      readonly type: 'snapshot'
      readonly requestId: string | null
      readonly orders: readonly LiveOrder[]
      readonly couriers: readonly Courier[]
    }
  | {
      readonly type: 'order'
      readonly orderId: string
      readonly roundId: string
      readonly status: OrderStatus
      readonly fromStatus: OrderStatus | null
      readonly courierId: string | null
      readonly previousCourierId: string | null
    }
  | { readonly type: 'pool_changed' }
  | { readonly type: 'round'; readonly roundId: string; readonly status: string }
  | { readonly type: 'position'; readonly position: CourierPosition }
  | { readonly type: 'shift'; readonly courierId: string; readonly onShift: boolean }
  | { readonly type: 'resync' }

export type LiveLink = 'offline' | 'connecting' | 'online'

export interface LiveState {
  readonly link: LiveLink
  readonly orders: readonly LiveOrder[]
  readonly couriers: readonly Courier[]
  /** Ya llegó un snapshot: lista vacía es "no hay nada", no "no cargó". */
  readonly loaded: boolean
  /** El servidor no lo deja entrar (sin sesión o sin rol de admin). */
  readonly denied: { readonly code: string; readonly message: string } | null
}

export const INITIAL_LIVE_STATE: LiveState = { link: 'offline', orders: [], couriers: [], loaded: false, denied: null }

/** Algo que el que llama tiene que hacer después de reducir. */
export type LiveEffect = 'request-snapshot'

export interface LiveReduction {
  readonly state: LiveState
  readonly effects: readonly LiveEffect[]
}

/**
 * Una posición sin renovar en este tiempo se muestra como vieja: el celular
 * perdió señal, se quedó sin batería o cerraron la app. Son 2 minutos porque la
 * app manda cada 15 s: ocho seguidas perdidas ya no es un bache de señal.
 */
export const POSITION_STALE_MS = 2 * 60_000

export function isStale(position: CourierPosition, now: Date): boolean {
  return now.getTime() - position.recordedAt.getTime() > POSITION_STALE_MS
}

/** Lo que el panel sigue: todavía no se entregó (ni se canceló). */
export function isLive(status: OrderStatus): boolean {
  return status === 'pending' || status === 'assigned' || status === 'on_the_way' || status === 'failed'
}

export function reduceLive(state: LiveState, message: LiveMessage): LiveReduction {
  switch (message.type) {
    case 'welcome':
      if (message.role !== 'admin') {
        return done({ ...state, denied: { code: 'FORBIDDEN', message: 'Esta pantalla es sólo para admins.' } })
      }
      return { state: { ...state, link: 'online', denied: null }, effects: ['request-snapshot'] }

    case 'snapshot':
      return done({ ...state, orders: message.orders, couriers: message.couriers, loaded: true })

    case 'order':
      return orderChanged(state, message)

    case 'position': {
      const known = state.couriers.some((courier) => courier.id === message.position.courierId)
      if (!known) return { state, effects: ['request-snapshot'] }
      return done({
        ...state,
        couriers: state.couriers.map((courier) => {
          if (courier.id !== message.position.courierId) return courier
          // Una más vieja que la que hay no mueve el marcador para atrás.
          const current = courier.position
          if (current && message.position.recordedAt < current.recordedAt) return courier
          return { ...courier, position: message.position }
        }),
      })
    }

    case 'shift': {
      const known = state.couriers.some((courier) => courier.id === message.courierId)
      if (!known) return { state, effects: ['request-snapshot'] }
      return done({
        ...state,
        couriers: state.couriers.map((courier) =>
          courier.id === message.courierId
            ? // Cortar el turno borra la posición (en la base también).
              { ...courier, onShift: message.onShift, position: message.onShift ? courier.position : null }
            : courier,
        ),
      })
    }

    case 'round':
    case 'pool_changed':
    case 'resync':
      return { state, effects: ['request-snapshot'] }

    case 'error':
      // Un error sin requestId antes del welcome es que no lo dejan entrar.
      if (message.requestId === null && state.link !== 'online') {
        return done({ ...state, denied: { code: message.code, message: message.message } })
      }
      return done(state)

    case 'ack':
      return done(state)
  }
}

function orderChanged(state: LiveState, change: Extract<LiveMessage, { type: 'order' }>): LiveReduction {
  const existing = state.orders.find((order) => order.id === change.orderId)
  if (!isLive(change.status)) {
    return done({ ...state, orders: state.orders.filter((order) => order.id !== change.orderId) })
  }
  if (!existing) {
    // Un pedido que no tenemos (recién cerrada la camada, o de una camada
    // abierta: el snapshot no lo va a traer y está bien). Pedir es barato.
    return { state, effects: ['request-snapshot'] }
  }
  const updated: LiveOrder = { ...existing, status: change.status, courierId: change.courierId, statusChangedAt: new Date() }
  return done({ ...state, orders: state.orders.map((order) => (order.id === change.orderId ? updated : order)) })
}

function done(state: LiveState): LiveReduction {
  return { state, effects: [] }
}

/** Los pedidos agrupados como los mira el admin, en el orden en que hay que atenderlos. */
export function groupOrders(orders: readonly LiveOrder[]) {
  return {
    failed: orders.filter((order) => order.status === 'failed'),
    pool: orders.filter((order) => order.status === 'pending' && order.courierId === null),
    assigned: orders.filter((order) => order.status === 'assigned'),
    onTheWay: orders.filter((order) => order.status === 'on_the_way'),
  }
}

export function courierLoad(orders: readonly LiveOrder[], courierId: string): number {
  return orders.filter((order) => order.courierId === courierId && (order.status === 'assigned' || order.status === 'on_the_way')).length
}
