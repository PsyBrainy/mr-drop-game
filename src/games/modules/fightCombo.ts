import type { MatchState, PlayerIndex } from '../../fight/sim/state'

/**
 * El contador de combo: "3 golpes" debajo del panel del que los está metiendo.
 *
 * Es de la vista, no de la sim (regla 6 de docs/pelea/reglas.md): se deriva
 * comparando el estado de un tick con el siguiente, como los sonidos, y no entra
 * al hash ni al replay. La sim no sabe qué es un combo; sólo sabe de hitstun.
 *
 * Un golpe cuenta como parte del combo si entra con el rival todavía aturdido,
 * con la misma definición que `data/combos.ts`: al menos 2 frames de hitstun al
 * empezar el tick (con 1, el rival ya tenía un frame para esquivar).
 */

/** Ticks que el número queda a la vista después de que el combo se cortó: medio segundo largo. */
export const COMBO_LINGER = 40

export interface ComboState {
  /** Golpes seguidos que metió cada jugador (por índice del que pega). */
  readonly count: readonly [number, number]
  /** Ticks que le quedan a la vista al combo que ya terminó. */
  readonly linger: readonly [number, number]
}

export const NO_COMBO: ComboState = { count: [0, 0], linger: [0, 0] }

export function comboStep(combo: ComboState, previous: MatchState, state: MatchState): ComboState {
  const count: [number, number] = [combo.count[0], combo.count[1]]
  const linger: [number, number] = [combo.linger[0], combo.linger[1]]

  for (const attacker of [0, 1] as const) {
    const victim: PlayerIndex = attacker === 0 ? 1 : 0
    const before = previous.fighters[victim]
    const now = state.fighters[victim]

    if (now.stocks < before.stocks) {
      // Lo sacó: el combo termina acá, y se deja ver cuántos fueron.
      linger[attacker] = count[attacker] >= 2 ? COMBO_LINGER : 0
      continue
    }

    const hit = now.damage > before.damage
    if (hit) {
      count[attacker] = before.hitstun >= 2 ? count[attacker] + 1 : 1
      linger[attacker] = 0
      continue
    }

    if (now.hitstun === 0 && before.hitstun > 0) {
      // Se le terminó el aturdimiento: el combo se cortó.
      linger[attacker] = count[attacker] >= 2 ? COMBO_LINGER : 0
      if (linger[attacker] === 0) count[attacker] = 0
      continue
    }

    if (now.hitstun === 0 && linger[attacker] > 0) {
      linger[attacker] -= 1
      if (linger[attacker] === 0) count[attacker] = 0
    }
  }

  return { count, linger }
}

/** Lo que dice el HUD para cada jugador: "3 golpes", o nada. */
export function comboLabels(combo: ComboState, state: MatchState): readonly [string | null, string | null] {
  const label = (attacker: PlayerIndex): string | null => {
    const n = combo.count[attacker]
    if (n < 2) return null
    const victim = state.fighters[attacker === 0 ? 1 : 0]
    const alive = victim.hitstun > 0 || combo.linger[attacker] > 0
    return alive ? `${n} golpes` : null
  }
  return [label(0), label(1)]
}
