export type SessionStatus = 'playing' | 'finished' | 'abandoned'

export interface GameSession {
  readonly id: string
  readonly eventGameId: string
  readonly status: SessionStatus
  readonly score: number
  readonly startedAt: Date
  readonly finishedAt: Date | null
}

/** El score que sale del juego nunca se confía tal cual: se acota antes de persistirlo. */
export const MAX_SCORE = 1_000_000

export function sanitizeScore(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  return Math.min(MAX_SCORE, Math.max(0, Math.floor(raw)))
}

export function isPlayable(session: GameSession): boolean {
  return session.status === 'playing'
}
