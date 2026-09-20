import type { EventGameDraft, GameRepository } from '../../application/ports/GameRepository'
import type { EventGame, Game } from '../../domain/game/Game'
import { getSupabase } from './client'
import { toEventGame, toGame } from './mappers'
import { translateError, unwrap } from './errors'
import type { EventGameRow, GameRow } from './rows'

const GAME_COLUMNS = 'id, slug, name, description, cover_url, engine'
const EVENT_GAME_COLUMNS = `id, event_id, game_id, is_enabled, position, max_plays, config, games ( ${GAME_COLUMNS} )`

export class SupabaseGameRepository implements GameRepository {
  async listCatalog(): Promise<Game[]> {
    const result = await getSupabase()
      .from('games')
      .select(GAME_COLUMNS)
      .order('name')
      .returns<GameRow[]>()
    return unwrap(result).map(toGame)
  }

  async listForEvent(eventId: string): Promise<EventGame[]> {
    const result = await getSupabase()
      .from('event_games')
      .select(EVENT_GAME_COLUMNS)
      .eq('event_id', eventId)
      .order('position')
      .returns<EventGameRow[]>()
    return unwrap(result).map(toEventGame)
  }

  async findEventGame(eventId: string, gameSlug: string): Promise<EventGame | null> {
    const { data, error } = await getSupabase()
      .from('event_games')
      .select(`id, event_id, game_id, is_enabled, position, max_plays, config, games!inner ( ${GAME_COLUMNS} )`)
      .eq('event_id', eventId)
      .eq('games.slug', gameSlug)
      .maybeSingle<EventGameRow>()
    if (error) throw translateError(error)
    return data ? toEventGame(data) : null
  }

  async upsertEventGame(draft: EventGameDraft): Promise<EventGame> {
    const result = await getSupabase()
      .from('event_games')
      .upsert(
        {
          event_id: draft.eventId,
          game_id: draft.gameId,
          is_enabled: draft.isEnabled,
          position: draft.position,
          max_plays: draft.maxPlays,
          config: draft.config,
        },
        { onConflict: 'event_id,game_id' },
      )
      .select(EVENT_GAME_COLUMNS)
      .single<EventGameRow>()
    return toEventGame(unwrap(result))
  }

  async setEnabled(eventGameId: string, isEnabled: boolean): Promise<EventGame> {
    const result = await getSupabase()
      .from('event_games')
      .update({ is_enabled: isEnabled })
      .eq('id', eventGameId)
      .select(EVENT_GAME_COLUMNS)
      .single<EventGameRow>()
    return toEventGame(unwrap(result))
  }
}
