/**
 * Un psy-ws de mentira, en memoria.
 *
 * No es un mock del transporte: es el servidor entero, chiquito, con las mismas
 * reglas que importan (emparejar, repartir inputs, comparar hashes, decidir el
 * final por acuerdo). Eso permite probar la sesión de red de los DOS lados a la
 * vez y verificar lo único que de verdad importa: que las dos simulaciones
 * terminen en el mismo estado.
 *
 * El servidor de verdad está en Kotlin y tiene sus propios tests. Este existe
 * para poder ejercitar al cliente sin levantar nada.
 */

import type { Transport } from '../net/port'
import { readInputs, type ClientMessage, type ServerMessage, type Slot } from '../net/protocol'
import { SIM_VERSION } from '../version'

class FakePeer implements Transport {

  readonly listeners: Array<(message: ServerMessage) => void> = []
  readonly closers: Array<() => void> = []
  readonly sent: ClientMessage[] = []
  slot: Slot = 0
  queued = false

  constructor(
    readonly id: string,
    private readonly relay: FakeRelay,
  ) {}

  send(message: ClientMessage): void {
    this.sent.push(message)
    this.relay.handle(this, message)
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const at = this.listeners.indexOf(listener)
      if (at >= 0) this.listeners.splice(at, 1)
    }
  }

  onClose(listener: () => void): () => void {
    this.closers.push(listener)
    return () => {
      const at = this.closers.indexOf(listener)
      if (at >= 0) this.closers.splice(at, 1)
    }
  }

  close(): void {
    this.closers.forEach((listener) => listener())
  }

  deliver(message: ServerMessage): void {
    this.listeners.forEach((listener) => listener(message))
  }
}

export class FakeRelay {

  private readonly peers: FakePeer[] = []
  private readonly checksums = new Map<number, Map<string, number>>()
  private readonly results = new Map<string, Slot | null>()

  /** Con esto prendido, los inputs se acumulan en vez de repartirse. */
  hold = false
  private held: Array<{ to: FakePeer; message: ServerMessage }> = []

  constructor(
    private readonly seed = 0xabcdef,
    private readonly inputDelay = 4,
  ) {}

  connect(id: string): Transport {
    const peer = new FakePeer(id, this)
    this.peers.push(peer)
    return peer
  }

  /** Entrega todo lo que estaba retenido. */
  flush(): void {
    const pending = this.held
    this.held = []
    pending.forEach(({ to, message }) => to.deliver(message))
  }

  handle(from: FakePeer, message: ClientMessage): void {
    switch (message.type) {
      case 'hello':
        from.deliver({ type: 'welcome', playerId: from.id, simVersion: SIM_VERSION })
        return

      case 'queue': {
        const waiting = this.peers.find((peer) => peer !== from && peer.queued)
        if (!waiting) {
          from.queued = true
          from.deliver({ type: 'queued' })
          return
        }
        waiting.queued = false
        this.startMatch(waiting, from)
        return
      }

      case 'inputs':
        this.relay(from, { type: 'inputs', from: message.from, inputs: message.inputs })
        return

      case 'checksum': {
        const atFrame = this.checksums.get(message.frame) ?? new Map<string, number>()
        atFrame.set(from.id, message.hash)
        this.checksums.set(message.frame, atFrame)
        if (atFrame.size < 2) return
        const [one, two] = [...atFrame.values()]
        if (one !== two) {
          this.peers.forEach((peer) => peer.deliver({ type: 'desync', frame: message.frame }))
        }
        return
      }

      case 'result': {
        this.results.set(from.id, message.winner)
        if (this.results.size < 2) return
        const [one, two] = [...this.results.values()]
        const agreed = one === two
        this.peers.forEach((peer) =>
          peer.deliver({
            type: 'ended',
            reason: agreed ? 'result' : 'disagreement',
            winner: agreed ? (one ?? null) : null,
          }),
        )
        return
      }

      case 'leave':
        from.queued = false
        return
    }
  }

  /** Los inputs de uno van al otro, nunca de vuelta al que los mandó. */
  private relay(from: FakePeer, message: ServerMessage): void {
    const other = this.peers.find((peer) => peer !== from)
    if (!other) return
    if (this.hold) {
      this.held.push({ to: other, message })
      return
    }
    other.deliver(message)
  }

  private startMatch(first: FakePeer, second: FakePeer): void {
    first.slot = 0
    second.slot = 1
    ;[first, second].forEach((peer) => {
      peer.deliver({
        type: 'match',
        matchId: 'fake',
        seed: this.seed,
        slot: peer.slot,
        inputDelay: this.inputDelay,
        opponent: peer === first ? second.id : first.id,
      })
    })
  }

  /** Lo que cada cliente mandó, para poder mirarlo en un test. */
  sentBy(id: string): ClientMessage[] {
    return this.peers.find((peer) => peer.id === id)?.sent ?? []
  }

  /** Corta la conexión de uno, como cuando alguien cierra la pestaña. */
  disconnect(id: string): void {
    this.peers.find((peer) => peer.id === id)?.close()
  }
}

export function decodeInputsOf(message: ClientMessage): { from: number; inputs: number[] } {
  if (message.type !== 'inputs') throw new Error('ese mensaje no es de inputs')
  const window = readInputs(message)
  return { from: window.from, inputs: [...window.inputs] }
}
