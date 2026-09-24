import type { ChannelStatus, DeliveryChannel } from '../ports/DeliveryChannel'
import {
  INITIAL_LIVE_STATE,
  reduceLive,
  type LiveMessage,
  type LiveState,
} from '../../domain/delivery/LiveDelivery'

export type CommandOutcome = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string }

export interface ConsoleView extends LiveState {
  /** Por qué no hay conexión, si se sabe. */
  readonly linkDetail: string | null
}

const OFFLINE: CommandOutcome = { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor de reparto.' }

/**
 * El reparto en vivo del panel: el estado de la pantalla y los comandos.
 *
 * No decide nada de los pedidos: manda la intención y espera el `ack` o el
 * `error` (que es lo que dijo la base). La lista cambia por el aviso que llega
 * después, no por el `ack`: así se ve lo que la base tiene, no lo que el panel
 * supuso.
 *
 * Expone `subscribe` / `getView` con la forma que pide `useSyncExternalStore`:
 * `getView` devuelve el MISMO objeto mientras nada cambie.
 */
export class DeliveryConsole {
  private view: ConsoleView = { ...INITIAL_LIVE_STATE, linkDetail: null }
  private readonly listeners = new Set<() => void>()
  private readonly waiting = new Map<string, (outcome: CommandOutcome) => void>()
  private channel: DeliveryChannel | null = null
  private unsubscribe: Array<() => void> = []
  /** Ya hay un snapshot pedido y sin contestar: varios avisos seguidos piden uno solo. */
  private snapshotPending = false

  constructor(
    private readonly openChannel: () => DeliveryChannel,
    private readonly newRequestId: () => string = () => crypto.randomUUID(),
    private readonly timeoutMs = 10_000,
  ) {}

  start = (): void => {
    if (this.channel) return
    const channel = this.openChannel()
    this.channel = channel
    this.unsubscribe = [
      channel.onMessage((message) => this.onMessage(message)),
      channel.onStatus((status, detail) => this.onStatus(status, detail)),
    ]
  }

  stop = (): void => {
    this.unsubscribe.forEach((off) => off())
    this.unsubscribe = []
    this.channel?.close()
    this.channel = null
    this.snapshotPending = false
    this.failAll(OFFLINE)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getView = (): ConsoleView => this.view

  /** Volver a pedir todo. */
  refresh = (): void => this.requestSnapshot()

  /** Asignar a un repartidor, o `null` para devolver a la bolsa. */
  assign = (orderId: string, courierId: string | null): Promise<CommandOutcome> => {
    if (this.view.link !== 'online' || !this.channel) return Promise.resolve(OFFLINE)
    const requestId = this.newRequestId()
    return new Promise<CommandOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(requestId)
        resolve({ ok: false, code: 'TIMEOUT', message: 'El servidor no respondió. Revisá la lista antes de reintentar.' })
      }, this.timeoutMs)
      this.waiting.set(requestId, (outcome) => {
        clearTimeout(timer)
        resolve(outcome)
      })
      if (!this.channel?.send({ type: 'assign', requestId, orderId, courierId })) {
        this.waiting.get(requestId)?.(OFFLINE)
        this.waiting.delete(requestId)
      }
    })
  }

  private onMessage(message: LiveMessage): void {
    if (message.type === 'ack' && message.requestId) this.settle(message.requestId, { ok: true })
    if (message.type === 'error' && message.requestId) {
      this.settle(message.requestId, { ok: false, code: message.code, message: message.message })
    }
    if (message.type === 'snapshot') this.snapshotPending = false

    const { state, effects } = reduceLive(this.view, message)
    this.update({ ...state, linkDetail: this.view.linkDetail })
    if (state.denied) this.stop()
    for (const effect of effects) {
      if (effect === 'request-snapshot') this.requestSnapshot()
    }
  }

  private onStatus(status: ChannelStatus, detail: string | null): void {
    if (status === 'closed') {
      this.snapshotPending = false
      this.failAll(OFFLINE)
      this.update({ ...this.view, link: 'offline', linkDetail: detail })
    } else {
      this.update({ ...this.view, link: 'connecting', linkDetail: status === 'open' ? null : this.view.linkDetail })
    }
  }

  private requestSnapshot(): void {
    if (this.snapshotPending || this.view.link !== 'online' || !this.channel) return
    this.snapshotPending = this.channel.send({ type: 'snapshot', requestId: null })
  }

  private settle(requestId: string, outcome: CommandOutcome): void {
    const resolve = this.waiting.get(requestId)
    if (!resolve) return
    this.waiting.delete(requestId)
    resolve(outcome)
  }

  private failAll(outcome: CommandOutcome): void {
    const pending = [...this.waiting.values()]
    this.waiting.clear()
    pending.forEach((resolve) => resolve(outcome))
  }

  private update(view: ConsoleView): void {
    this.view = view
    this.listeners.forEach((listener) => listener())
  }
}
