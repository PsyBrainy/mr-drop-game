/**
 * Utilidades para armar partidas en los tests. No es un test: vive acá adentro
 * para quedar fuera del barrido de pureza, que es sólo para la sim de verdad.
 */

import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { NONE, type Input } from '../sim/input'
import type { Fighter, MatchState, PlayerIndex } from '../sim/state'
import { DEFAULT_RULES, type World } from '../sim/world'
import type { Frame, Replay } from '../replay/format'
import { SIM_VERSION } from '../version'

export function testWorld(): World {
  return {
    stage: SMALL_STAGE,
    tuning: [OSO, OSO],
    rules: DEFAULT_RULES,
  }
}

/** `frames` frames con ese input para el jugador 0 y nada para el 1. */
export function hold(input: Input, frames: number): Frame[] {
  return Array.from({ length: frames }, () => [input, NONE] as Frame)
}

export function replayOf(frames: readonly Frame[], seed = 0x1234): Replay {
  return { simVersion: SIM_VERSION, seed, frames }
}

/** Un estado con un jugador retocado, para arrancar un test en la situación que interesa. */
export function withFighter(
  state: MatchState,
  index: PlayerIndex,
  patch: Partial<Fighter>,
): MatchState {
  const fighters: [Fighter, Fighter] = [state.fighters[0], state.fighters[1]]
  fighters[index] = { ...fighters[index], ...patch }
  return { ...state, fighters }
}
