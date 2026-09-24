import { z } from 'zod'
import type { Courier, CourierPosition, LiveMessage, LiveOrder } from '../../domain/delivery/LiveDelivery'
import type { OrderStatus } from '../../domain/order/Order'
import type { DeliveryCommand } from '../../application/ports/DeliveryChannel'

/**
 * El cable de `/ws/delivery`, del lado del panel.
 *
 * La fuente del contrato es psy-ws (`DeliveryProtocol.kt`). Acá se lo refleja,
 * y `delivery-protocol.fixtures.json` (el mismo archivo commiteado en psy-ws y
 * en la app de repartidores) es lo que evita que se separen: `protocol.test.ts`
 * verifica que el panel entiende todo lo que manda el servidor y que lo que
 * manda tiene los campos que el servidor espera. Al cambiar un mensaje se copia
 * el fixture nuevo acá en el mismo cambio, o no se cambia.
 *
 * Un mensaje que no se entiende es `null` y se ignora: el servidor puede sumar
 * mensajes nuevos sin romper un panel viejo.
 */

/** Lo que manda el panel: los comandos del puerto, más el saludo (que es del transporte). */
export type WireCommand = DeliveryCommand | { readonly type: 'hello'; readonly token: string }

export function encodeCommand(command: WireCommand): string {
  return JSON.stringify(command)
}

const statusSchema = z.enum(['pending', 'assigned', 'on_the_way', 'delivered', 'failed', 'cancelled'])
const nullableText = z.string().nullable()
const nullableNumber = z.number().nullable()

const positionSchema = z.object({
  courierId: z.string(),
  lat: z.number(),
  lng: z.number(),
  accuracyM: nullableNumber,
  headingDeg: nullableNumber,
  speedMps: nullableNumber,
  recordedAt: z.string(),
})

const orderSchema = z.object({
  id: z.string(),
  roundId: z.string(),
  status: statusSchema,
  courierId: nullableText,
  customerName: z.string(),
  addressLabel: z.string(),
  lat: z.number(),
  lng: z.number(),
  notes: z.string(),
  total: z.string(),
  deliveryFee: z.string(),
  statusChangedAt: z.string(),
  items: z.array(z.object({ name: z.string(), quantity: z.number() })),
})

const courierSchema = z.object({
  courierId: z.string(),
  displayName: z.string(),
  onShift: z.boolean(),
  position: positionSchema.nullable(),
})

const serverSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), userId: z.string(), role: z.string(), onShift: z.boolean().nullable().optional() }),
  z.object({ type: z.literal('ack'), requestId: nullableText }),
  z.object({ type: z.literal('error'), requestId: nullableText, code: z.string(), message: z.string() }),
  z.object({
    type: z.literal('snapshot'),
    requestId: nullableText,
    onShift: z.boolean().nullable().optional(),
    orders: z.array(orderSchema),
    couriers: z.array(courierSchema),
  }),
  z.object({
    type: z.literal('order'),
    orderId: z.string(),
    roundId: z.string(),
    status: statusSchema,
    fromStatus: statusSchema.nullable(),
    courierId: nullableText,
    previousCourierId: nullableText,
  }),
  z.object({ type: z.literal('pool_changed') }),
  z.object({ type: z.literal('round'), roundId: z.string(), status: z.string() }),
  z.object({ type: z.literal('position') }).merge(positionSchema),
  z.object({ type: z.literal('shift'), courierId: z.string(), onShift: z.boolean() }),
  z.object({ type: z.literal('resync') }),
])

export function parseMessage(text: string): LiveMessage | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = serverSchema.safeParse(raw)
  if (!parsed.success) return null
  const message = parsed.data

  switch (message.type) {
    case 'welcome':
      return { type: 'welcome', userId: message.userId, role: message.role }
    case 'ack':
      return { type: 'ack', requestId: message.requestId }
    case 'error':
      return { type: 'error', requestId: message.requestId, code: message.code, message: message.message }
    case 'snapshot':
      return {
        type: 'snapshot',
        requestId: message.requestId,
        orders: message.orders.map(toOrder),
        couriers: message.couriers.map(toCourier),
      }
    case 'order':
      return {
        type: 'order',
        orderId: message.orderId,
        roundId: message.roundId,
        status: message.status as OrderStatus,
        fromStatus: message.fromStatus as OrderStatus | null,
        courierId: message.courierId,
        previousCourierId: message.previousCourierId,
      }
    case 'pool_changed':
      return { type: 'pool_changed' }
    case 'round':
      return { type: 'round', roundId: message.roundId, status: message.status }
    case 'position':
      return { type: 'position', position: toPosition(message) }
    case 'shift':
      return { type: 'shift', courierId: message.courierId, onShift: message.onShift }
    case 'resync':
      return { type: 'resync' }
  }
}

function toPosition(raw: z.infer<typeof positionSchema>): CourierPosition {
  return {
    courierId: raw.courierId,
    lat: raw.lat,
    lng: raw.lng,
    accuracyM: raw.accuracyM,
    headingDeg: raw.headingDeg,
    speedMps: raw.speedMps,
    recordedAt: new Date(raw.recordedAt),
  }
}

function toOrder(raw: z.infer<typeof orderSchema>): LiveOrder {
  return {
    id: raw.id,
    roundId: raw.roundId,
    status: raw.status as OrderStatus,
    courierId: raw.courierId,
    customerName: raw.customerName,
    addressLabel: raw.addressLabel,
    lat: raw.lat,
    lng: raw.lng,
    notes: raw.notes,
    total: raw.total,
    deliveryFee: raw.deliveryFee,
    items: raw.items,
    statusChangedAt: new Date(raw.statusChangedAt),
  }
}

function toCourier(raw: z.infer<typeof courierSchema>): Courier {
  return {
    id: raw.courierId,
    displayName: raw.displayName,
    onShift: raw.onShift,
    position: raw.position ? toPosition(raw.position) : null,
  }
}
