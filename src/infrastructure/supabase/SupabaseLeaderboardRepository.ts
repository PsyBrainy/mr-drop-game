import type { LeaderboardRepository } from '../../application/ports/LeaderboardRepository'
import type { LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'
import { getSupabase } from './client'
import { toLeaderboardEntry } from './mappers'
import { unwrap } from './errors'
import type { LeaderboardRow } from './rows'

const COLUMNS =
  'event_id, event_game_id, game_slug, user_id, display_name, avatar_url, best_score, first_finished_at, plays, payload'

export class SupabaseLeaderboardRepository implements LeaderboardRepository {
  async forEventGame(eventGameId: string, limit = 20): Promise<LeaderboardEntry[]> {
    const result = await getSupabase()
      .from('leaderboard')
      .select(COLUMNS)
      .eq('event_game_id', eventGameId)
      .order('best_score', { ascending: false })
      .order('first_finished_at', { ascending: true })
      .limit(limit)
      .returns<LeaderboardRow[]>()
    return unwrap(result).map(toLeaderboardEntry)
  }

  async forEvent(eventId: string, limit = 50): Promise<LeaderboardEntry[]> {
    const result = await getSupabase()
      .from('leaderboard')
      .select(COLUMNS)
      .eq('event_id', eventId)
      .order('best_score', { ascending: false })
      .limit(limit)
      .returns<LeaderboardRow[]>()
    return unwrap(result).map(toLeaderboardEntry)
  }
}
