/**
 * El ranking de la pelea: cuántas ganó y cuántas perdió cada uno en un juego de
 * concurso. Sólo cuentan las peleas online contra personas que el validador
 * confirmó re-simulando la partida (ver `0011_fight_ranking.sql`).
 */
export interface FightRecord {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly wins: number
  readonly losses: number
}

/**
 * Orden: más ganadas primero. A igualdad, menos perdidas (ganar 5 de 5 vale más
 * que ganar 5 de 12), y después por nombre para que el orden no salte entre
 * recargas.
 */
export function rankFights(records: readonly FightRecord[]): FightRecord[] {
  return [...records].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (a.losses !== b.losses) return a.losses - b.losses
    return a.displayName.localeCompare(b.displayName, 'es')
  })
}

/** Puesto (desde 1) de un usuario en el ranking ya ordenado, o null si no peleó. */
export function fightPositionOf(ranked: readonly FightRecord[], userId: string): number | null {
  const index = ranked.findIndex((record) => record.userId === userId)
  return index === -1 ? null : index + 1
}
