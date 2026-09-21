import type { Order, OrderDraftLine, OrderRound, OrderStatus } from '../../domain/order/Order'

export interface OpenedRound {
  roundId: string
  code: string
}

/** Pedido con el perfil del dueño, para el panel de reparto. */
export interface OrderWithProfile extends Order {
  displayName: string
  avatarUrl: string | null
}

export interface OrderRepository {
  getOpenRound(): Promise<OrderRound | null>
  /** Si ya canjeé el código de esa camada. */
  isMemberOf(roundId: string): Promise<boolean>
  joinRound(code: string): Promise<string>
  getMyOrder(roundId: string): Promise<Order | null>
  listMyOrders(): Promise<Order[]>
  placeOrder(lines: OrderDraftLine[], notes: string): Promise<Order>
  cancelMyOrder(): Promise<Order>

  // --- admin ---
  listRounds(): Promise<OrderRound[]>
  getRoundCode(roundId: string): Promise<string | null>
  openRound(name: string): Promise<OpenedRound>
  closeRound(roundId: string): Promise<OrderRound>
  /** Borra la camada con todos sus pedidos. */
  deleteRound(roundId: string): Promise<void>
  listForRound(roundId: string): Promise<OrderWithProfile[]>
  setStatus(orderId: string, status: OrderStatus): Promise<void>
  delete(orderId: string): Promise<void>
}
