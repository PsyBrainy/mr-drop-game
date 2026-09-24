/**
 * El contrato con psy-ws. Este archivo es la fuente única: el servidor en Kotlin
 * refleja estos mensajes, y las fixtures de `protocol.fixtures.json` se comparten
 * entre los dos repos para que un cambio de nombre acá rompa un test allá.
 *
 * Tres reglas que explican la forma de todo lo de abajo:
 *
 * 1. **El cliente manda input, nunca estado.** Nada de "morí" ni "le pegué":
 *    sólo botones. Un cliente que pudiera afirmar resultados sería un cliente al
 *    que hay que creerle.
 * 2. **Los inputs viajan redundantes.** Cada mensaje lleva una ventana de los
 *    últimos frames, no sólo el actual. WebSocket es TCP: un paquete demorado
 *    llega igual, pero si cada frame viajara una sola vez, el retraso de uno
 *    frenaría la partida entera.
 * 3. **El servidor no simula.** Es sala, relé y registro. La autoridad es
 *    diferida: con el log de inputs se re-simula la partida headless y recién
 *    ahí se escribe el ranking.
 */

import { bytesToHex, hexToBytes } from '../bytes'
import type { Input } from '../sim/input'
import { SIM_VERSION } from '../version'

/** Cuántos frames hacia atrás viaja cada mensaje de input. */
export const INPUT_REDUNDANCY = 8

/** Frames de retraso entre apretar y que salga. Lo fija el servidor al armar el match. */
export const DEFAULT_INPUT_DELAY = 4

/** Cada cuántos frames se intercambia el hash del estado. */
export const CHECKSUM_EVERY = 30

export type Slot = 0 | 1

/** Una ventana de inputs de UN jugador: `from` es el frame del primero. */
export interface InputWindow {
  readonly from: number
  readonly inputs: readonly Input[]
}

export type ClientMessage =
  /** Primer mensaje. El token es de Supabase; sin él, el servidor decide si acepta invitados. */
  | { readonly type: 'hello'; readonly simVersion: number; readonly token?: string }
  /**
   * Ponerse en cola. `eventGameId` es el juego del concurso (una fila de
   * `event_games`) desde el que se entra: sólo se empareja con gente del mismo
   * concurso, y la partida cuenta para el ranking de ese concurso. Sin él (el
   * sandbox), se juega igual pero no cuenta para ningún ranking.
   */
  | { readonly type: 'queue'; readonly eventGameId?: string }
  | { readonly type: 'leave' }
  | { readonly type: 'inputs'; readonly from: number; readonly inputs: string }
  /**
   * El hash del estado en ese frame. Es un entero de 32 bits SIN signo (de 0 a
   * 4.294.967.295): más grande de lo que entra en un entero con signo, que es
   * con lo que lo lee el servidor. Si cambia el tipo de este campo, hay que
   * mirar del otro lado.
   */
  | { readonly type: 'checksum'; readonly frame: number; readonly hash: number }
  /** Lo que el cliente CREE que pasó. El servidor lo cruza con lo del otro. */
  | { readonly type: 'result'; readonly frame: number; readonly winner: Slot | null }

export type EndReason = 'result' | 'forfeit' | 'desync' | 'disagreement' | 'abandoned'

export type ServerMessage =
  | { readonly type: 'welcome'; readonly playerId: string; readonly simVersion: number }
  | { readonly type: 'queued' }
  | {
      readonly type: 'match'
      readonly matchId: string
      readonly seed: number
      readonly slot: Slot
      readonly inputDelay: number
      readonly opponent: string
    }
  /** Los inputs del rival, tal como llegaron. */
  | { readonly type: 'inputs'; readonly from: number; readonly inputs: string }
  /** Los dos hashes del mismo frame no coincidieron: la partida se corta acá. */
  | { readonly type: 'desync'; readonly frame: number }
  | { readonly type: 'ended'; readonly reason: EndReason; readonly winner: Slot | null }
  | { readonly type: 'error'; readonly code: ProtocolErrorCode; readonly message: string }

export type ProtocolErrorCode =
  /** El cliente corre otra versión de la sim: no pueden jugar juntos. */
  | 'SIM_VERSION_MISMATCH'
  | 'AUTH_REQUIRED'
  | 'BAD_MESSAGE'
  | 'NOT_IN_MATCH'
  | 'ALREADY_QUEUED'
  /** No puede entrar a la pelea de ese concurso: está apagada, cerrado, o no participa. */
  | 'NOT_ALLOWED'

export function hello(token?: string): ClientMessage {
  return token === undefined
    ? { type: 'hello', simVersion: SIM_VERSION }
    : { type: 'hello', simVersion: SIM_VERSION, token }
}

export function queueMessage(eventGameId?: string): ClientMessage {
  return eventGameId === undefined ? { type: 'queue' } : { type: 'queue', eventGameId }
}

export function inputsMessage(window: InputWindow): ClientMessage {
  return { type: 'inputs', from: window.from, inputs: bytesToHex(window.inputs) }
}

export function readInputs(message: {
  readonly from: number
  readonly inputs: string
}): InputWindow {
  return { from: message.from, inputs: hexToBytes(message.inputs) }
}

/**
 * La ventana que toca mandar en este frame: el actual y los anteriores que
 * todavía pueden no haber llegado. Se recorta contra el principio del match.
 */
export function windowFor(frame: number, history: readonly Input[]): InputWindow {
  const from = Math.max(0, frame - INPUT_REDUNDANCY + 1)
  return { from, inputs: history.slice(from, frame + 1) }
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return (
    type === 'hello' ||
    type === 'queue' ||
    type === 'leave' ||
    type === 'inputs' ||
    type === 'checksum' ||
    type === 'result'
  )
}
