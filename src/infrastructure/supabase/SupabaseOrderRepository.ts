import type {
  OpenedRound,
  OrderRepository,
  OrderWithProfile,
} from '../../application/ports/OrderRepository'
import { normalizeDraft, type Order, type OrderDraftLine, type OrderRound, type OrderStatus } from '../../domain/order/Order'
import { domainError } from '../../domain/shared/DomainError'
import { getSupabase } from './client'
import { translateError, unwrap } from './errors'
import { toOrder, toOrderRound, toOrderWithProfile } from './mappers'
import type { OrderRoundRow, OrderRow } from './rows'

const ROUND_COLUMNS = 'id, name, status, opened_at, closed_at'
const ORDER_COLUMNS =
  'id, round_id, user_id, status, notes, total, delivery_fee, delivery_inside, lat, lng, address_label, courier_id, created_at, delivered_at, order_items (product_id, name, unit_price, quantity)'

export class SupabaseOrderRepository implements OrderRepository {
  async getOpenRound(): Promise<OrderRound | null> {
    const result = await getSupabase()
      .from('order_rounds')
      .select(ROUND_COLUMNS)
      .eq('status', 'open')
      .maybeSingle<OrderRoundRow>()
    if (result.error) throw translateError(result.error)
    return result.data ? toOrderRound(result.data) : null
  }

  async isMemberOf(roundId: string): Promise<boolean> {
    const { count, error } = await getSupabase()
      .from('order_round_members')
      .select('round_id', { count: 'exact', head: true })
      .eq('round_id', roundId)
      .eq('user_id', await currentUserId())
    if (error) throw translateError(error)
    return (count ?? 0) > 0
  }

  async joinRound(code: string): Promise<string> {
    const { data, error } = await getSupabase().rpc('join_order_round', { p_code: code })
    if (error) throw translateError(error)
    return data as string
  }

  async getMyOrder(roundId: string): Promise<Order | null> {
    const result = await getSupabase()
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('round_id', roundId)
      .eq('user_id', await currentUserId())
      .maybeSingle<OrderRow>()
    if (result.error) throw translateError(result.error)
    return result.data ? toOrder(result.data) : null
  }

  async listMyOrders(): Promise<Order[]> {
    const result = await getSupabase()
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('user_id', await currentUserId())
      .order('created_at', { ascending: false })
      .returns<OrderRow[]>()
    return unwrap(result).map(toOrder)
  }

  async placeOrder(lines: OrderDraftLine[], notes: string): Promise<Order> {
    const items = normalizeDraft(lines).map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
    }))
    if (items.length === 0) throw domainError('ORDER_EMPTY')

    const { data, error } = await getSupabase().rpc('place_order', {
      p_items: items,
      p_notes: notes.trim(),
    })
    if (error) throw translateError(error)
    // El RPC devuelve la fila sin items: se relee con el embed.
    const placed = data as { round_id: string }
    const order = await this.getMyOrder(placed.round_id)
    if (!order) throw domainError('UNEXPECTED')
    return order
  }

  async cancelMyOrder(): Promise<Order> {
    const { data, error } = await getSupabase().rpc('cancel_my_order')
    if (error) throw translateError(error)
    return toOrder(data as OrderRow)
  }

  async listRounds(): Promise<OrderRound[]> {
    const result = await getSupabase()
      .from('order_rounds')
      .select(ROUND_COLUMNS)
      .order('opened_at', { ascending: false })
      .returns<OrderRoundRow[]>()
    return unwrap(result).map(toOrderRound)
  }

  async getRoundCode(roundId: string): Promise<string | null> {
    const result = await getSupabase()
      .from('order_round_codes')
      .select('code')
      .eq('round_id', roundId)
      .maybeSingle<{ code: string }>()
    if (result.error) throw translateError(result.error)
    return result.data?.code ?? null
  }

  async openRound(name: string): Promise<OpenedRound> {
    const { data, error } = await getSupabase().rpc('open_order_round', { p_name: name.trim() })
    if (error) throw translateError(error)
    const row = (data as { round_id: string; code: string }[] | null)?.[0]
    if (!row) throw domainError('UNEXPECTED')
    return { roundId: row.round_id, code: row.code }
  }

  async closeRound(roundId: string): Promise<OrderRound> {
    const result = await getSupabase()
      .from('order_rounds')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', roundId)
      .select(ROUND_COLUMNS)
      .single<OrderRoundRow>()
    return toOrderRound(unwrap(result))
  }

  async deleteRound(roundId: string): Promise<void> {
    const { error } = await getSupabase().from('order_rounds').delete().eq('id', roundId)
    if (error) throw translateError(error)
  }

  async listForRound(roundId: string): Promise<OrderWithProfile[]> {
    const result = await getSupabase()
      .from('orders')
      .select(`${ORDER_COLUMNS}, profiles (display_name, avatar_url)`)
      .eq('round_id', roundId)
      .order('created_at', { ascending: true })
      .returns<OrderRow[]>()
    return unwrap(result).map(toOrderWithProfile)
  }

  async setStatus(orderId: string, status: OrderStatus): Promise<void> {
    const { error } = await getSupabase()
      .from('orders')
      // delivered_at, courier_id y el historial los resuelve el trigger de
      // 0013 a partir del estado: acá solo se manda el estado.
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) throw translateError(error)
  }

  async delete(orderId: string): Promise<void> {
    const { error } = await getSupabase().from('orders').delete().eq('id', orderId)
    if (error) throw translateError(error)
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw domainError('AUTH_REQUIRED')
  return userId
}
