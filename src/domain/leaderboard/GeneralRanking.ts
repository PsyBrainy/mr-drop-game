import type { LeaderboardEntry } from './LeaderboardEntry'

/** Un jugador en el ranking general: la suma de su mejor puntaje en cada juego. */
export interface GeneralRankingEntry {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly totalScore: number
  readonly gamesPlayed: number
  /** Cuándo alcanzó su último récord: desempata a favor de quien llegó antes. */
  readonly lastRecordAt: Date | null
}

/**
 * Agrupa las entradas por-juego del leaderboard en un total por usuario.
 * Más puntos primero; a igualdad, quien completó su marca antes.
 */
export function generalRanking(entries: readonly LeaderboardEntry[]): GeneralRankingEntry[] {
  const byUser = new Map<string, GeneralRankingEntry>()

  for (const entry of entries) {
    const current = byUser.get(entry.userId)
    const at = entry.firstFinishedAt
    byUser.set(entry.userId, {
      userId: entry.userId,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      totalScore: (current?.totalScore ?? 0) + entry.bestScore,
      gamesPlayed: (current?.gamesPlayed ?? 0) + 1,
      lastRecordAt: later(current?.lastRecordAt ?? null, at),
    })
  }

  return [...byUser.values()].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    const at = a.lastRecordAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bt = b.lastRecordAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    return at - bt
  })
}

function later(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}
