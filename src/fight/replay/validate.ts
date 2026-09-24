/**
 * La validación de una partida online: volver a jugarla desde el log de inputs
 * y confirmar quién ganó. Es todo el anti-cheat del juego, y es lo único que
 * deja que una partida entre al ranking.
 *
 * El servidor (psy-ws) no simula: guarda lo que los dos navegadores dijeron.
 * Un cliente trucho podría decir que ganó; lo que no puede hacer es cambiar lo
 * que apretó, porque sus inputs los vio y los guardó el servidor. Con la semilla
 * y esos inputs, la sim reconstruye la partida entera, y el resultado que sale
 * de acá es el que vale — no el que reportaron.
 *
 * Es puro: recibe la fila y devuelve el veredicto. Lo usa el proceso validador
 * (`validator/`), que lee las partidas pendientes de la base y escribe esto.
 */

import { initialState, type PlayerIndex } from '../sim/state'
import { step } from '../sim/tick'
import type { World } from '../sim/world'
import { SIM_VERSION } from '../version'

export type Ending = 'decided' | 'forfeit' | 'desync' | 'disagreement' | 'abandoned'

/** Lo que el servidor archivó de una partida (una fila de `fight_matches`). */
export interface ArchivedMatch {
  readonly seed: number
  /** El ganador que archivó el servidor: el que acordaron los dos, o el que se quedó. */
  readonly winner: PlayerIndex | null
  readonly ending: Ending
  /** Cuántos frames tiene el log. */
  readonly frames: number
  /** El log: cuatro dígitos hex por frame, dos por jugador. */
  readonly replay: string
  /** La versión de la sim con la que se jugó. `null` en las partidas de antes de que se guardara. */
  readonly simVersion: number | null
}

export type Verdict =
  /** El resultado es real. `winner` es el que vale, que puede no ser el archivado. */
  | { readonly kind: 'ok'; readonly winner: PlayerIndex | null }
  /** El replay dice otra cosa que el resultado: alguien mintió, o algo se rompió. No cuenta. */
  | { readonly kind: 'mismatch'; readonly reason: string }
  /** No hay cómo validarla (sin resultado, versión vieja, log ilegible). No cuenta. */
  | { readonly kind: 'unplayable'; readonly reason: string }
  /** Se jugó con una sim más nueva que la de este validador: la valida el que se actualice. */
  | { readonly kind: 'later' }

const HEX = /^[0-9a-f]*$/i

export function validateMatch(match: ArchivedMatch, world: World, simVersion = SIM_VERSION): Verdict {
  if (match.ending !== 'decided' && match.ending !== 'forfeit') {
    return { kind: 'unplayable', reason: `terminó por ${match.ending}: no hay resultado que validar` }
  }
  if (match.simVersion === null) return { kind: 'unplayable', reason: 'no se sabe con qué versión se jugó' }
  if (match.simVersion > simVersion) return { kind: 'later' }
  if (match.simVersion < simVersion) {
    return { kind: 'unplayable', reason: `se jugó con la versión ${match.simVersion} y la sim ya es la ${simVersion}` }
  }
  if (match.replay.length % 4 !== 0 || !HEX.test(match.replay)) {
    return { kind: 'unplayable', reason: 'el log de inputs es ilegible' }
  }
  const frames = match.replay.length / 4
  if (frames !== match.frames) {
    return { kind: 'mismatch', reason: `el log tiene ${frames} frames y la fila dice ${match.frames}` }
  }

  // Se juega frame por frame hasta que la sim diga que terminó. Los frames que
  // sobran después del final son normales: los inputs viajan con unos frames
  // de adelanto, y el log los guarda igual.
  let state = initialState(world, match.seed)
  for (let at = 0; at < match.replay.length && !state.over; at += 4) {
    const one = Number.parseInt(match.replay.slice(at, at + 2), 16)
    const two = Number.parseInt(match.replay.slice(at + 2, at + 4), 16)
    state = step(state, [one, two], world)
  }

  if (match.ending === 'decided') {
    if (!state.over) return { kind: 'mismatch', reason: 'dijeron que terminó y el replay no llega al final' }
    if (state.winner !== match.winner) {
      return { kind: 'mismatch', reason: `dijeron que ganó ${match.winner} y el replay dice ${state.winner}` }
    }
    return { kind: 'ok', winner: state.winner }
  }

  // Abandono. Si la partida ya estaba terminada cuando alguien se fue, manda la
  // sim: irse después de ganar no le regala la victoria al otro.
  if (state.over) return { kind: 'ok', winner: state.winner }
  if (match.winner === null) return { kind: 'unplayable', reason: 'un abandono sin ganador' }
  // Se fue en el medio: pierde el que se fue. Eso lo sabe el servidor (vio la
  // desconexión), no lo dijo ningún cliente.
  return { kind: 'ok', winner: match.winner }
}
