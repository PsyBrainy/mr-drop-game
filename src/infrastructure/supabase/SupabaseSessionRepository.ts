import type { SessionRepository } from '../../application/ports/SessionRepository'
import type { GameSession } from '../../domain/session/GameSession'
import { domainError } from '../../domain/shared/DomainError'
import { getSupabase } from './client'
import { toSession } from './mappers'
import { translateError } from './errors'
import type { GameSessionRow } from './rows'

const COLUMNS = 'id, event_game_id, status, score, started_at, finished_at'

export class SupabaseSessionRepository implements SessionRepository {
  async start(eventGameId: string): Promise<GameSession> {
    const supabase = getSupabase()
    const { data: sessionId, error } = await supabase.rpc('start_game_session', {
      p_event_game_id: eventGameId,
    })
    if (error) throw translateError(error)
    if (typeof sessionId !== 'string') throw domainError('UNEXPECTED')

    const { data, error: readError } = await supabase
      .from('game_sessions')
      .select(COLUMNS)
      .eq('id', sessionId)
      .single<GameSessionRow>()
    if (readError) throw translateError(readError)
    return toSession(data)
  }

  async finish(
    sessionId: string,
    score: number,
    payload: Record<string, unknown> = {},
  ): Promise<GameSession> {
    const { data, error } = await getSupabase().rpc('finish_game_session', {
      p_session_id: sessionId,
      p_score: score,
      p_payload: payload,
    })
    if (error) throw translateError(error)
    return toSession(data as GameSessionRow)
  }

  async countPlays(eventGameId: string): Promise<number> {
    const { count, error } = await getSupabase()
      .from('game_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('event_game_id', eventGameId)
      .neq('status', 'abandoned')
    if (error) throw translateError(error)
    return count ?? 0
  }

  async myBestScore(eventGameId: string): Promise<number | null> {
    const { data, error } = await getSupabase()
      .from('game_sessions')
      .select('score')
      .eq('event_game_id', eventGameId)
      .eq('status', 'finished')
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle<{ score: number }>()
    if (error) throw translateError(error)
    return data?.score ?? null
  }
}
