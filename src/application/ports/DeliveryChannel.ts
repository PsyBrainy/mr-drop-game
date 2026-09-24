import type { LiveMessage } from '../../domain/delivery/LiveDelivery'

/**
 * El canal en vivo del reparto (`/ws/delivery` en psy-ws), del lado del panel.
 * La implementación (WebSocket con reconexión) vive en
 * `infrastructure/delivery/`; el caso de uso no sabe que hay un socket.
 */

/** Lo que el panel le pide al servidor. `requestId` vuelve en el `ack` / `error`. */
export type DeliveryCommand =
  | { readonly type: 'snapshot'; readonly requestId: string | null }
  | { readonly type: 'assign'; readonly requestId: string; readonly orderId: string; readonly courierId: string | null }

/** Cómo está el transporte. `open` no es "en línea": recién con el `welcome` se sabe que el servidor lo aceptó. */
export type ChannelStatus = 'connecting' | 'open' | 'closed'

export interface DeliveryChannel {
  /** `false` si no hay conexión abierta: el comando no salió. */
  send(command: DeliveryCommand): boolean
  onMessage(listener: (message: LiveMessage) => void): () => void
  /** `detail`: por qué se cortó, si se sabe. Para mostrar y para diagnosticar. */
  onStatus(listener: (status: ChannelStatus, detail: string | null) => void): () => void
  close(): void
}
