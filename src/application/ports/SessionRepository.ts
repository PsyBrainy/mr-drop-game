import type { GameSession } from '../../domain/session/GameSession'

export interface SessionRepository {
  start(eventGameId: string): Promise<GameSession>
  finish(sessionId: string, score: number, payload?: Record<string, unknown>): Promise<GameSession>
  countPlays(eventGameId: string): Promise<number>
  myBestScore(eventGameId: string): Promise<number | null>
}
