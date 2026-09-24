/**
 * Una pasada del validador: trae las partidas pendientes, las vuelve a jugar y
 * anota el veredicto. No sabe de Postgres: habla con la base por `MatchStore`,
 * así se prueba con una de mentira.
 */

import { validateMatch, type ArchivedMatch, type Verdict } from '../../src/fight/replay/validate'
import type { World } from '../../src/fight/sim/world'

export interface PendingMatch extends ArchivedMatch {
  readonly id: string
}

export type StoredVerdict = 'ok' | 'mismatch' | 'unplayable'

export interface MatchStore {
  /** Las que tienen resultado y nadie validó, de las versiones de sim que éste puede jugar. */
  pending(maxSimVersion: number, limit: number): Promise<PendingMatch[]>
  /** Anota el veredicto. Sólo si sigue pendiente: dos validadores no se pisan. */
  save(id: string, verdict: StoredVerdict, reason: string | null, winner: 0 | 1 | null): Promise<void>
}

export interface PassReport {
  readonly checked: number
  readonly ok: number
  readonly rejected: number
}

export async function validatePending(
  store: MatchStore,
  world: World,
  simVersion: number,
  limit: number,
  log: (line: string) => void = () => {},
): Promise<PassReport> {
  const matches = await store.pending(simVersion, limit)
  let ok = 0
  let rejected = 0
  for (const match of matches) {
    const verdict = safeValidate(match, world, simVersion)
    // Una de una sim más nueva no llega acá (la consulta las filtra), pero si
    // llegara se deja pendiente para el validador que esté al día.
    if (verdict.kind === 'later') continue
    if (verdict.kind === 'ok') {
      ok += 1
      await store.save(match.id, 'ok', null, verdict.winner)
    } else {
      rejected += 1
      log(`partida ${match.id}: ${verdict.kind} — ${verdict.reason}`)
      await store.save(match.id, verdict.kind, verdict.reason, null)
    }
  }
  return { checked: matches.length, ok, rejected }
}

/** Una fila rota no puede frenar la cola: se la marca y se sigue. */
function safeValidate(match: PendingMatch, world: World, simVersion: number): Verdict {
  try {
    return validateMatch(match, world, simVersion)
  } catch (error) {
    return { kind: 'unplayable', reason: `no se pudo re-simular: ${String(error)}` }
  }
}
