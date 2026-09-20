import type { LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'

export interface LeaderboardRepository {
  forEventGame(eventGameId: string, limit?: number): Promise<LeaderboardEntry[]>
  forEvent(eventId: string, limit?: number): Promise<LeaderboardEntry[]>
}
