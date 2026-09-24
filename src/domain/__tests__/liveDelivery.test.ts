import { describe, expect, it } from 'vitest'
import {
  INITIAL_LIVE_STATE,
  groupOrders,
  isStale,
  reduceLive,
  type Courier,
  type LiveOrder,
  type LiveState,
} from '../delivery/LiveDelivery'

const order = (id: string, patch: Partial<LiveOrder> = {}): LiveOrder => ({
  id,
  roundId: 'r',
  status: 'pending',
  courierId: null,
  customerName: 'Cliente',
  addressLabel: 'Calle 1',
  lat: -34.9,
  lng: -57.9,
  notes: '',
  total: '100.00',
  deliveryFee: '0',
  items: [],
  statusChangedAt: new Date(0),
  ...patch,
})

const courier = (id: string, patch: Partial<Courier> = {}): Courier => ({
  id,
  displayName: id,
  onShift: true,
  position: null,
  ...patch,
})

const online: LiveState = { ...INITIAL_LIVE_STATE, link: 'online', loaded: true }

describe('reparto en vivo (panel)', () => {
  it('al saludar como admin queda en línea y pide todo', () => {
    const r = reduceLive(INITIAL_LIVE_STATE, { type: 'welcome', userId: 'a', role: 'admin' })
    expect(r.state.link).toBe('online')
    expect(r.effects).toEqual(['request-snapshot'])
  })

  it('un repartidor no es admin: no entra al panel', () => {
    const r = reduceLive(INITIAL_LIVE_STATE, { type: 'welcome', userId: 'c', role: 'courier' })
    expect(r.state.denied?.code).toBe('FORBIDDEN')
  })

  it('un cambio de estado se aplica sin pedir nada', () => {
    const state = { ...online, orders: [order('a')] }
    const r = reduceLive(state, {
      type: 'order', orderId: 'a', roundId: 'r', status: 'assigned', fromStatus: 'pending', courierId: 'c1', previousCourierId: null,
    })
    expect(r.state.orders[0]).toMatchObject({ status: 'assigned', courierId: 'c1' })
    expect(r.effects).toEqual([])
  })

  it('entregado o cancelado sale del panel en vivo', () => {
    const state = { ...online, orders: [order('a', { status: 'on_the_way', courierId: 'c1' })] }
    const r = reduceLive(state, {
      type: 'order', orderId: 'a', roundId: 'r', status: 'delivered', fromStatus: 'on_the_way', courierId: 'c1', previousCourierId: 'c1',
    })
    expect(r.state.orders).toEqual([])
  })

  it('un pedido que no tenemos pide el detalle; cerrar la camada también', () => {
    expect(
      reduceLive(online, {
        type: 'order', orderId: 'x', roundId: 'r', status: 'pending', fromStatus: null, courierId: null, previousCourierId: null,
      }).effects,
    ).toEqual(['request-snapshot'])
    expect(reduceLive(online, { type: 'round', roundId: 'r', status: 'closed' }).effects).toEqual(['request-snapshot'])
  })

  it('la posición mueve el marcador, pero una vieja no lo lleva para atrás', () => {
    const at = (seconds: number) => new Date(seconds * 1000)
    const pos = (seconds: number, lat: number) => ({
      courierId: 'c1', lat, lng: -57.9, accuracyM: null, headingDeg: null, speedMps: null, recordedAt: at(seconds),
    })
    const state = { ...online, couriers: [courier('c1')] }
    const moved = reduceLive(state, { type: 'position', position: pos(100, -34.91) }).state
    expect(moved.couriers[0]!.position?.lat).toBe(-34.91)
    const late = reduceLive(moved, { type: 'position', position: pos(50, -1) }).state
    expect(late.couriers[0]!.position?.lat).toBe(-34.91)
  })

  it('cortar el turno borra la posición', () => {
    const state = {
      ...online,
      couriers: [courier('c1', { position: { courierId: 'c1', lat: 1, lng: 1, accuracyM: null, headingDeg: null, speedMps: null, recordedAt: new Date() } })],
    }
    const r = reduceLive(state, { type: 'shift', courierId: 'c1', onShift: false })
    expect(r.state.couriers[0]).toMatchObject({ onShift: false, position: null })
  })

  it('un repartidor que no conocemos pide todo', () => {
    expect(reduceLive(online, { type: 'shift', courierId: 'nuevo', onShift: true }).effects).toEqual(['request-snapshot'])
  })

  it('una posición de hace más de 2 minutos es "sin señal"', () => {
    const now = new Date(1_000_000)
    const position = { courierId: 'c', lat: 0, lng: 0, accuracyM: null, headingDeg: null, speedMps: null, recordedAt: new Date(now.getTime() - 121_000) }
    expect(isStale(position, now)).toBe(true)
    expect(isStale({ ...position, recordedAt: new Date(now.getTime() - 30_000) }, now)).toBe(false)
  })

  it('agrupa como lo atiende el admin', () => {
    const groups = groupOrders([
      order('bolsa'),
      order('asignado', { status: 'assigned', courierId: 'c' }),
      order('camino', { status: 'on_the_way', courierId: 'c' }),
      order('fallo', { status: 'failed', courierId: 'c' }),
    ])
    expect(groups.pool.map((o) => o.id)).toEqual(['bolsa'])
    expect(groups.assigned.map((o) => o.id)).toEqual(['asignado'])
    expect(groups.onTheWay.map((o) => o.id)).toEqual(['camino'])
    expect(groups.failed.map((o) => o.id)).toEqual(['fallo'])
  })
})
