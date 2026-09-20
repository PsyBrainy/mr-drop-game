import { positionOf, rank, type LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'
import type { LeaderboardRepository } from '../ports/LeaderboardRepository'

export interface RankedBoard {
  entries: LeaderboardEntry[]
  myPosition: number | null
}

export class GetLeaderboard {
  constructor(private readonly leaderboard: LeaderboardRepository) {}

  async forGame(eventGameId: string, userId: string | null, limit = 20): Promise<RankedBoard> {
    const raw = await this.leaderboard.forEventGame(eventGameId, limit)
    return { entries: rank(raw), myPosition: userId ? positionOf(raw, userId) : null }
  }

  async forEvent(eventId: string, userId: string | null, limit = 50): Promise<RankedBoard> {
    const raw = await this.leaderboard.forEvent(eventId, limit)
    return { entries: rank(raw), myPosition: userId ? positionOf(raw, userId) : null }
  }
}
