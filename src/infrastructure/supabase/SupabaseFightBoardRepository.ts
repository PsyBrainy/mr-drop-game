import type { FightBoardRepository } from '../../application/ports/FightBoardRepository'
import type { FightRecord } from '../../domain/fight/FightRecord'
import { getSupabase } from './client'
import { unwrap } from './errors'
import { toFightRecord } from './mappers'
import type { FightLeaderboardRow } from './rows'

export class SupabaseFightBoardRepository implements FightBoardRepository {
  async forEventGame(eventGameId: string): Promise<FightRecord[]> {
    const result = await getSupabase()
      .from('fight_leaderboard')
      .select('user_id, display_name, avatar_url, wins, losses')
      .eq('event_game_id', eventGameId)
      .order('wins', { ascending: false })
      .limit(1000)
      .returns<FightLeaderboardRow[]>()
    return unwrap(result).map(toFightRecord)
  }
}
