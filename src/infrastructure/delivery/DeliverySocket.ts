import type { ChannelStatus, DeliveryChannel, DeliveryCommand, } from '../../application/ports/DeliveryChannel'
import type { LiveMessage } from '../../domain/delivery/LiveDelivery'
import { fightServerUrl } from '../ws/WebSocketTransport'
import { encodeCommand, parseMessage } from './protocol'

/**
 * Dónde está `/ws/delivery`. Es el mismo psy-ws que la pelea: si no hay una
 * variable propia, se deriva de `VITE_FIGHT_WS_URL` cambiando la ruta, así un
 * deploy que ya tiene la pelea no necesita configurar nada más.
 */
export const deliveryServerUrl =
  import.meta.env.VITE_DELIVERY_WS_URL?.trim() || fightServerUrl.replace(/\/ws\/fight\/?$/, '/ws/delivery')

export const deliveryServerConfigured = /\/ws\/delivery\/?$/.test(deliveryServerUrl)

const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

/**
 * `/ws/delivery` con reconexión. Cada conexión saluda con el token vigente de
 * Supabase (psy-ws lo verifica sólo al saludar, así que alcanza con que esté
 * vigente al conectar). Espera creciente entre intentos: 1 s, 2 s, 4 s… 30 s.
 */
export function createDeliveryChannel(url: string, token: () => Promise<string | undefined>): DeliveryChannel {
  const messageListeners = new Set<(message: LiveMessage) => void>()
  const statusListeners = new Set<(status: ChannelStatus, detail: string | null) => void>()
  let socket: WebSocket | null = null
  let stopped = false
  let retryMs = FIRST_RETRY_MS
  let timer: ReturnType<typeof setTimeout> | undefined

  const emitStatus = (status: ChannelStatus, detail: string | null = null) =>
    statusListeners.forEach((listener) => listener(status, detail))

  const scheduleRetry = () => {
    if (stopped) return
    timer = setTimeout(() => void connect(), retryMs)
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
  }

  async function connect(): Promise<void> {
    if (stopped) return
    emitStatus('connecting')
    const accessToken = await token()
    if (stopped) return
    if (!accessToken) {
      emitStatus('closed', 'No hay sesión: volvé a entrar.')
      scheduleRetry()
      return
    }

    const ws = new WebSocket(url)
    socket = ws
    ws.addEventListener('open', () => {
      retryMs = FIRST_RETRY_MS
      emitStatus('open')
      ws.send(encodeCommand({ type: 'hello', token: accessToken }))
    })
    ws.addEventListener('message', (event: MessageEvent<string>) => {
      const message = parseMessage(String(event.data))
      if (message) messageListeners.forEach((listener) => listener(message))
    })
    ws.addEventListener('close', (event) => {
      if (socket === ws) socket = null
      if (stopped) return
      // El navegador no dice por qué falló un WebSocket (es a propósito); el
      // código de cierre es lo único que hay. 1006 = no se pudo conectar.
      emitStatus('closed', event.code === 1000 ? null : `Se cortó la conexión (código ${event.code})`)
      scheduleRetry()
    })
  }

  // En el próximo tick: así el que crea el canal alcanza a suscribirse antes
  // del primer cambio de estado.
  queueMicrotask(() => void connect())

  return {
    send(command: DeliveryCommand) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false
      socket.send(encodeCommand(command))
      return true
    },
    onMessage(listener) {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },
    onStatus(listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    close() {
      stopped = true
      clearTimeout(timer)
      socket?.close(1000)
      socket = null
      emitStatus('closed')
    },
  }
}
