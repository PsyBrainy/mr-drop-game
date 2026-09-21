import type { Coordinates } from '../user/UserAddress'

export type RoundStatus = 'open' | 'closed'
export type OrderStatus = 'pending' | 'delivered' | 'cancelled'

export interface OrderRound {
  readonly id: string
  readonly name: string
  readonly status: RoundStatus
  readonly openedAt: Date
  readonly closedAt: Date | null
}

export interface OrderItem {
  readonly productId: string | null
  readonly name: string
  readonly unitPrice: number
  readonly quantity: number
}

export interface Order extends Coordinates {
  readonly id: string
  readonly roundId: string
  readonly userId: string
  readonly status: OrderStatus
  readonly notes: string
  /** Combos + envío. */
  readonly total: number
  readonly deliveryFee: number
  /** null en pedidos anteriores al costo de envío. */
  readonly deliveryInside: boolean | null
  readonly addressLabel: string
  readonly items: OrderItem[]
  readonly createdAt: Date
  readonly deliveredAt: Date | null
}

/** Lo que el usuario arma en pantalla antes de confirmar. */
export interface OrderDraftLine {
  productId: string
  quantity: number
}

export const MAX_ITEM_QUANTITY = 99
export const MAX_ORDER_NOTES = 300

export function isRoundOpen(round: OrderRound | null): round is OrderRound {
  return round?.status === 'open'
}

export function draftTotal(lines: OrderDraftLine[], prices: ReadonlyMap<string, number>): number {
  return lines.reduce((sum, line) => sum + (prices.get(line.productId) ?? 0) * line.quantity, 0)
}

export function normalizeDraft(lines: OrderDraftLine[]): OrderDraftLine[] {
  return lines
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0)
    .map((line) => ({ productId: line.productId, quantity: Math.min(line.quantity, MAX_ITEM_QUANTITY) }))
}

export function itemCount(order: Pick<Order, 'items'>): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0)
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}
