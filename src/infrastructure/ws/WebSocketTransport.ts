import { getSupabase, isSupabaseConfigured } from '../supabase/client'
import type { Transport } from '../../fight/net/port'
import type { ClientMessage, ServerMessage } from '../../fight/net/protocol'

/**
 * El adaptador de WebSocket: la única parte del cliente que sabe que existe un
 * socket. La sesión de red habla con el puerto `Transport` y no con esto, así
 * que el día que haga falta UDP de verdad (WebTransport o un DataChannel de
 * WebRTC) se escribe otro adaptador y ni la sesión ni la simulación se enteran.
 *
 * Está en `infrastructure` por la misma razón que los repositorios de Supabase:
 * es un detalle de cómo se habla con el afuera.
 */
export function createWebSocketTransport(url: string): Transport {
  const socket = new WebSocket(url)
  const listeners: Array<(message: ServerMessage) => void> = []
  const closers: Array<() => void> = []

  /**
   * Lo que se mande antes de que el socket abra se guarda. La sesión saluda
   * apenas arranca, y hacerla esperar a que el socket esté listo le agregaría un
   * estado más a algo que no lo necesita.
   */
  const pending: string[] = []
  let open = false

  socket.addEventListener('open', () => {
    open = true
    pending.splice(0).forEach((text) => socket.send(text))
  })

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    let message: ServerMessage
    try {
      message = JSON.parse(event.data) as ServerMessage
    } catch {
      // Un mensaje ilegible del servidor no puede tirar la partida: se ignora y
      // el `checksum` se va a encargar si de verdad nos quedamos sin algo.
      return
    }
    listeners.forEach((listener) => listener(message))
  })

  const closed = (): void => closers.forEach((listener) => listener())
  socket.addEventListener('close', closed)
  socket.addEventListener('error', closed)

  return {
    send(message: ClientMessage) {
      const text = JSON.stringify(message)
      if (open) socket.send(text)
      else pending.push(text)
    },

    onMessage(listener) {
      listeners.push(listener)
      return () => {
        const at = listeners.indexOf(listener)
        if (at >= 0) listeners.splice(at, 1)
      }
    },

    onClose(listener) {
      closers.push(listener)
      return () => {
        const at = closers.indexOf(listener)
        if (at >= 0) closers.splice(at, 1)
      }
    },

    close() {
      socket.close()
    },
  }
}

/**
 * Dónde está el servidor de peleas (psy-ws). Se lee igual que la URL de
 * Supabase: Vite reemplaza `import.meta.env.X` por su valor al compilar, así que
 * esto queda horneado en el build.
 *
 * Sin la variable no hay pelea online, y eso se muestra como tal en vez de
 * intentar conectarse a cualquier lado.
 */
export const fightServerUrl = import.meta.env.VITE_FIGHT_WS_URL?.trim() ?? ''

export const fightServerConfigured = fightServerUrl.length > 0

/**
 * El token con el que el jugador se presenta ante psy-ws. Es el mismo JWT que
 * el front usa para hablar con la base, así que el servidor puede verificarlo
 * contra las claves públicas del proyecto sin preguntarle nada a nadie.
 *
 * Devuelve `undefined` cuando no hay sesión o Supabase no está configurado: el
 * servidor decide si acepta invitados, y no es este lado el que tiene que
 * adivinarlo.
 */
export async function currentFightToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured) return undefined
  try {
    const { data } = await getSupabase().auth.getSession()
    return data.session?.access_token
  } catch {
    return undefined
  }
}
