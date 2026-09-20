import type { EventGame, Game } from '../../domain/game/Game'

export interface EventGameDraft {
  eventId: string
  gameId: string
  isEnabled: boolean
  position: number
  maxPlays: number
  config: Record<string, unknown>
}

export interface GameRepository {
  /** Catálogo completo de juegos registrados en la base. */
  listCatalog(): Promise<Game[]>
  /** Juegos de un evento. Para un jugador, RLS devuelve solo los habilitados. */
  listForEvent(eventId: string): Promise<EventGame[]>
  findEventGame(eventId: string, gameSlug: string): Promise<EventGame | null>
  upsertEventGame(draft: EventGameDraft): Promise<EventGame>
  setEnabled(eventGameId: string, isEnabled: boolean): Promise<EventGame>
}
