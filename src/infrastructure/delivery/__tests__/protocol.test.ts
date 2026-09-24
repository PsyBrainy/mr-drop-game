import { describe, expect, it } from 'vitest'
import fixtures from '../delivery-protocol.fixtures.json'
import { encodeCommand, parseMessage, type WireCommand } from '../protocol'

/**
 * El contrato del cable con psy-ws. `delivery-protocol.fixtures.json` es una
 * copia del de psy-ws (la fuente) y del de la app de repartidores: si alguien
 * cambia un mensaje de un lado sin el otro, algún test rompe.
 */
describe('protocolo de /ws/delivery', () => {
  it('el panel entiende todo lo que manda el servidor', () => {
    for (const message of fixtures.server) {
      expect(parseMessage(JSON.stringify(message)), JSON.stringify(message)).not.toBeNull()
    }
  })

  it('lo que manda el panel tiene los campos que el servidor espera', () => {
    const sent: WireCommand[] = [
      { type: 'hello', token: 'jwt' },
      { type: 'snapshot', requestId: 'r1' },
      { type: 'assign', requestId: 'r6', orderId: 'o', courierId: 'c' },
    ]
    for (const command of sent) {
      const mine = JSON.parse(encodeCommand(command)) as Record<string, unknown>
      const examples = (fixtures.client as Array<Record<string, unknown>>).filter((m) => m.type === command.type)
      expect(examples.length, `el servidor no conoce ${command.type}`).toBeGreaterThan(0)
      const widest = examples.reduce((a, b) => (Object.keys(b).length > Object.keys(a).length ? b : a))
      expect(Object.keys(mine).sort()).toEqual(Object.keys(widest).sort())
    }
  })

  it('devolver a la bolsa manda courierId null, no lo omite', () => {
    const text = encodeCommand({ type: 'assign', requestId: 'r', orderId: 'o', courierId: null })
    expect(JSON.parse(text)).toHaveProperty('courierId', null)
  })

  it('lo que no entiende es null, no una excepción', () => {
    expect(parseMessage('no es json')).toBeNull()
    expect(parseMessage('{"type":"otra-cosa"}')).toBeNull()
    expect(parseMessage('{"type":"order","orderId":"x"}')).toBeNull()
  })

  it('las fechas llegan como Date', () => {
    const message = parseMessage(JSON.stringify(fixtures.server.find((m) => m.type === 'position')))
    expect(message?.type).toBe('position')
    if (message?.type === 'position') expect(message.position.recordedAt).toBeInstanceOf(Date)
  })
})
