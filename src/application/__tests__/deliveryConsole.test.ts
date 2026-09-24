import { describe, expect, it } from 'vitest'
import type { ChannelStatus, DeliveryChannel, DeliveryCommand } from '../ports/DeliveryChannel'
import { DeliveryConsole } from '../usecases/DeliveryConsole'
import type { LiveMessage } from '../../domain/delivery/LiveDelivery'

/** Un canal de mentira: lo que se manda queda en `sent`; `receive` simula al servidor. */
function fakeChannel() {
  const messageListeners: Array<(m: LiveMessage) => void> = []
  const statusListeners: Array<(s: ChannelStatus, d: string | null) => void> = []
  const sent: DeliveryCommand[] = []
  const channel: DeliveryChannel = {
    send(command) {
      sent.push(command)
      return true
    },
    onMessage(listener) {
      messageListeners.push(listener)
      return () => undefined
    },
    onStatus(listener) {
      statusListeners.push(listener)
      return () => undefined
    },
    close() {},
  }
  return {
    channel,
    sent,
    receive: (message: LiveMessage) => messageListeners.forEach((l) => l(message)),
    status: (status: ChannelStatus, detail: string | null = null) => statusListeners.forEach((l) => l(status, detail)),
  }
}

function connected() {
  const fake = fakeChannel()
  let n = 0
  const console = new DeliveryConsole(() => fake.channel, () => `r${++n}`)
  console.start()
  fake.status('open')
  fake.receive({ type: 'welcome', userId: 'admin', role: 'admin' })
  return { fake, console }
}

describe('DeliveryConsole', () => {
  it('al entrar pide el estado una sola vez aunque lleguen varios avisos', () => {
    const { fake } = connected()
    fake.receive({ type: 'pool_changed' })
    fake.receive({ type: 'resync' })
    expect(fake.sent.filter((c) => c.type === 'snapshot')).toHaveLength(1)
    fake.receive({ type: 'snapshot', requestId: null, orders: [], couriers: [] })
    fake.receive({ type: 'resync' })
    expect(fake.sent.filter((c) => c.type === 'snapshot')).toHaveLength(2)
  })

  it('asignar espera la respuesta de la base', async () => {
    const { fake, console } = connected()
    const answer = console.assign('o1', 'c1')
    expect(fake.sent.at(-1)).toEqual({ type: 'assign', requestId: 'r1', orderId: 'o1', courierId: 'c1' })
    fake.receive({ type: 'error', requestId: 'r1', code: 'NOT_A_COURIER', message: 'Esa persona no es repartidor.' })
    await expect(answer).resolves.toEqual({ ok: false, code: 'NOT_A_COURIER', message: 'Esa persona no es repartidor.' })
  })

  it('si se corta la conexión, lo que esperaba respuesta falla en vez de colgarse', async () => {
    const { fake, console } = connected()
    const answer = console.assign('o1', null)
    fake.status('closed', 'Se cortó la conexión (código 1006)')
    await expect(answer).resolves.toMatchObject({ ok: false, code: 'OFFLINE' })
    expect(console.getView()).toMatchObject({ link: 'offline', linkDetail: 'Se cortó la conexión (código 1006)' })
  })

  it('sin conexión no se manda nada', async () => {
    const fake = fakeChannel()
    const console = new DeliveryConsole(() => fake.channel)
    console.start()
    await expect(console.assign('o1', 'c1')).resolves.toMatchObject({ ok: false, code: 'OFFLINE' })
    expect(fake.sent).toEqual([])
  })

  it('la vista es el mismo objeto mientras nada cambia (lo pide useSyncExternalStore)', () => {
    const { console } = connected()
    expect(console.getView()).toBe(console.getView())
  })
})
