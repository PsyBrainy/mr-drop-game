import type { OrderStatus } from './Order'

/**
 * El recorrido de un pedido una vez cerrada la camada, visto desde el
 * repartidor. La base es la que decide (courier_transition_allowed() en
 * 0013_delivery_tracking.sql); esto es el espejo para que la UI no ofrezca
 * botones que la base va a rechazar.
 *
 * Tres copias que tienen que decir lo mismo: esta, la de la migración y
 * orderFlow.contract.json (que va también en la app Android).
 * courierFlow.test.ts cruza las tres: cambiar una sola rompe el test.
 *
 * El admin no está acá a propósito: puede corregir cualquier estado desde el
 * panel, así que para él no hay transiciones prohibidas que modelar.
 */

export interface CourierTransition {
  readonly from: OrderStatus
  readonly to: OrderStatus
  /** Qué función de la base la ejecuta. Tomar de la bolsa es distinto de mover lo propio. */
  readonly via: 'claim_order' | 'courier_update_order'
}

export const COURIER_TRANSITIONS: readonly CourierTransition[] = [
  { from: 'pending', to: 'assigned', via: 'claim_order' },
  { from: 'assigned', to: 'on_the_way', via: 'courier_update_order' },
  // Soltarlo: vuelve a la bolsa para que lo tome otro.
  { from: 'assigned', to: 'pending', via: 'courier_update_order' },
  { from: 'on_the_way', to: 'delivered', via: 'courier_update_order' },
  { from: 'on_the_way', to: 'failed', via: 'courier_update_order' },
]

export function courierCanMove(from: OrderStatus, to: OrderStatus): boolean {
  return COURIER_TRANSITIONS.some((t) => t.from === from && t.to === to)
}

export function courierNextStatuses(from: OrderStatus): OrderStatus[] {
  return COURIER_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
}

/** Todavía no llegó: cuenta como pendiente de reparto en el panel. */
export function isAwaitingDelivery(status: OrderStatus): boolean {
  return status === 'pending' || status === 'assigned' || status === 'on_the_way'
}

/** Hay un repartidor responsable. La base exige courier_id en estos estados. */
export function hasCourier(status: OrderStatus): boolean {
  return status === 'assigned' || status === 'on_the_way'
}
