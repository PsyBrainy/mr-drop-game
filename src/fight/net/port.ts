/**
 * El transporte, como puerto. La sesión de red habla con esto y no con
 * WebSocket: hoy el transporte es TCP porque es lo que hay en el navegador sin
 * servidor de medios, pero el rollback quiere UDP, y el día que haga falta
 * (WebTransport o un DataChannel de WebRTC) se cambia el adaptador y ni la
 * sesión ni la simulación se enteran.
 */

import type { ClientMessage, ServerMessage } from './protocol'

export interface Transport {
  send(message: ClientMessage): void
  /** Devuelve la función para dejar de escuchar. */
  onMessage(listener: (message: ServerMessage) => void): () => void
  onClose(listener: () => void): () => void
  close(): void
}
