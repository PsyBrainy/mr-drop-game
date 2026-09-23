import { describe, expect, it } from 'vitest'
import fixtures from '../net/protocol.fixtures.json'
import {
  INPUT_REDUNDANCY,
  hello,
  inputsMessage,
  isClientMessage,
  readInputs,
  windowFor,
  type ClientMessage,
  type ServerMessage,
} from '../net/protocol'
import { JUMP, LEFT, NONE, RIGHT, type Input } from '../sim/input'
import { SIM_VERSION } from '../version'

/**
 * Las fixtures son el contrato con psy-ws, y están commiteadas en los dos
 * repos. Este test las verifica de este lado; el test de Kotlin las verifica del
 * otro. Si alguien renombra un campo en un solo repo, uno de los dos rompe — que
 * es todo lo que se puede hacer para que dos lenguajes no se desincronicen.
 */

describe('contrato con el servidor', () => {
  it('las fixtures están escritas para esta versión de la sim', () => {
    expect(fixtures.simVersion).toBe(SIM_VERSION)
  })

  it('todos los mensajes del cliente son reconocibles', () => {
    for (const message of fixtures.client) {
      expect(isClientMessage(message)).toBe(true)
    }
  })

  it('cubren todos los tipos que existen', () => {
    // Un tipo sin fixture es un tipo que psy-ws puede no estar reflejando.
    const client = new Set(fixtures.client.map((m) => m.type))
    const server = new Set(fixtures.server.map((m) => m.type))

    expect([...client].sort()).toEqual(['checksum', 'hello', 'inputs', 'leave', 'queue', 'result'])
    expect([...server].sort()).toEqual([
      'desync', 'ended', 'error', 'inputs', 'match', 'queued', 'welcome',
    ])
  })

  it('rechaza cualquier cosa que no sea un mensaje', () => {
    expect(isClientMessage(null)).toBe(false)
    expect(isClientMessage({ type: 'cualquiera' })).toBe(false)
    expect(isClientMessage('hello')).toBe(false)
  })
})

describe('ventana de inputs', () => {
  const history: Input[] = [NONE, LEFT, LEFT, RIGHT, JUMP, NONE, RIGHT, RIGHT, JUMP, NONE, LEFT]

  it('manda los últimos frames, no sólo el actual', () => {
    // Redundancia: con TCP un paquete demorado llega igual, pero si cada frame
    // viajara una sola vez, el retraso de uno frenaría la partida entera.
    const window = windowFor(10, history)

    expect(window.inputs).toHaveLength(INPUT_REDUNDANCY)
    expect(window.from).toBe(10 - INPUT_REDUNDANCY + 1)
    expect(window.inputs[window.inputs.length - 1]).toBe(history[10])
  })

  it('al principio del match manda lo que hay', () => {
    const window = windowFor(2, history)

    expect(window.from).toBe(0)
    expect(window.inputs).toEqual([NONE, LEFT, LEFT])
  })

  it('sobrevive a ir y volver del cable', () => {
    const window = windowFor(10, history)
    const message = inputsMessage(window)

    expect(message.type).toBe('inputs')
    if (message.type !== 'inputs') throw new Error('tipo inesperado')
    // Dos dígitos hex por frame: la ventana entera son 16 caracteres.
    expect(message.inputs).toHaveLength(INPUT_REDUNDANCY * 2)
    expect(readInputs(message)).toEqual(window)
  })

  it('el saludo lleva la versión de la sim', () => {
    const greeting = hello() as Extract<ClientMessage, { type: 'hello' }>

    // Dos clientes con sims distintas no pueden jugar juntos: no es un problema
    // de protocolo, es que verían dos partidas diferentes.
    expect(greeting.simVersion).toBe(SIM_VERSION)
    expect(greeting.token).toBeUndefined()
  })
})

describe('las fixtures del servidor son del tipo que dicen ser', () => {
  it.each(fixtures.server.map((m) => [m.type, m]))('%s', (_type, message) => {
    // Un `as` con el tipo puesto a mano: si el mensaje del JSON no encaja con la
    // unión, esto no compila, y es exactamente lo que se quiere verificar.
    const typed = message as unknown as ServerMessage
    expect(typed.type).toBe(message.type)
  })
})
