/**
 * Un replay es la semilla más la lista de inputs por frame. Nada de estado.
 *
 * Es el corazón del modelo: si la sim es determinista, esto reconstruye la
 * partida entera. Sirve para tres cosas que valen por separado, y las tres salen
 * del mismo archivo de 200 bytes:
 *
 * 1. El servidor re-simula el log en Node y valida quién ganó antes de escribir
 *    el ranking. Es todo el anti-cheat del juego.
 * 2. Un bug se reporta con un replay y se reproduce exacto, cuantas veces haga
 *    falta. Sin esto, un bug de pelea online es irreproducible por definición.
 * 3. Ver partidas guardadas sale gratis.
 *
 * El formato es texto para que entre en una columna de Postgres y se pueda pegar
 * en un test como fixture.
 */

import { byteToHex, hexToByte } from '../bytes'
import { step } from '../sim/tick'
import { initialState, type MatchState } from '../sim/state'
import type { Input } from '../sim/input'
import type { World } from '../sim/world'
import { SIM_VERSION } from '../version'

/** Los dos inputs de un frame, en orden de jugador. */
export type Frame = readonly [Input, Input]

export interface Replay {
  readonly simVersion: number
  readonly seed: number
  readonly frames: readonly Frame[]
}

/**
 * `v<version>:<semilla en hex>:<dos bytes por frame en hex>`.
 *
 * Todavía no guarda qué personaje ni qué escenario: hay uno de cada. Cuando haya
 * más, el replay va a tener que decirlo — un campo que hoy siempre vale lo mismo
 * sería una mentira que después hay que migrar.
 */
export function encodeReplay(replay: Replay): string {
  const inputs = replay.frames
    .map((frame) => byteToHex(frame[0]) + byteToHex(frame[1]))
    .join('')
  return `v${replay.simVersion}:${(replay.seed >>> 0).toString(16)}:${inputs}`
}

export function decodeReplay(text: string): Replay {
  const parts = text.split(':')
  const [version, seed, inputs] = parts
  if (parts.length !== 3 || version === undefined || seed === undefined || inputs === undefined) {
    throw new Error(`replay ilegible: esperaba "v<n>:<seed>:<inputs>" y vino "${text}"`)
  }

  const simVersion = Number(version.replace(/^v/, ''))
  if (!Number.isInteger(simVersion)) throw new Error(`versión de sim ilegible: "${version}"`)
  if (inputs.length % 4 !== 0) {
    throw new Error(`el log de inputs tiene ${inputs.length} dígitos y no es múltiplo de 4`)
  }

  const frames: Frame[] = []
  for (let at = 0; at < inputs.length; at += 4) {
    frames.push([hexToByte(inputs, at), hexToByte(inputs, at + 2)])
  }

  return { simVersion, seed: Number.parseInt(seed, 16) >>> 0, frames }
}

/**
 * No es un error de formato sino de compatibilidad, y se chequea aparte: un
 * replay viejo se puede leer y mirar, pero no se puede usar para validar un
 * resultado con la sim de hoy.
 */
export function isPlayable(replay: Replay): boolean {
  return replay.simVersion === SIM_VERSION
}

/** Re-simula el replay completo y devuelve el estado final. */
export function runReplay(replay: Replay, world: World): MatchState {
  let state = initialState(world, replay.seed)
  for (const frame of replay.frames) state = step(state, frame, world)
  return state
}

/**
 * El estado tick por tick. Cuando dos peers reportan hashes distintos, comparar
 * las dos trazas dice el frame exacto en el que se separaron — que es la
 * diferencia entre arreglar un desync en una tarde y no arreglarlo nunca.
 */
export function replayTrace(replay: Replay, world: World): MatchState[] {
  const trace: MatchState[] = []
  let state = initialState(world, replay.seed)
  for (const frame of replay.frames) {
    state = step(state, frame, world)
    trace.push(state)
  }
  return trace
}
