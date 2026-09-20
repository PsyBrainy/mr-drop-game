export interface LeaderboardEntry {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly gameSlug: string
  readonly bestScore: number
  readonly firstFinishedAt: Date | null
  readonly plays: number
}

/**
 * Orden del ranking: más puntaje primero y, a igualdad, quien lo logró antes.
 */
export function rank(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore
    const at = a.firstFinishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bt = b.firstFinishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    return at - bt
  })
}

export function positionOf(entries: readonly LeaderboardEntry[], userId: string): number | null {
  const index = rank(entries).findIndex((entry) => entry.userId === userId)
  return index === -1 ? null : index + 1
}
