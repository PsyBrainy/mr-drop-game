import type { EventGame } from '../../domain/game/Game'
import type { GameRepository } from '../ports/GameRepository'

/**
 * Caso de uso del admin: prender y apagar juegos para un evento puntual.
 * La autorización real la impone RLS; acá vive la regla de negocio.
 */
export class ManageEventGames {
  constructor(private readonly games: GameRepository) {}

  listForEvent(eventId: string): Promise<EventGame[]> {
    return this.games.listForEvent(eventId)
  }

  toggle(eventGameId: string, isEnabled: boolean): Promise<EventGame> {
    return this.games.setEnabled(eventGameId, isEnabled)
  }

  /** Suma un juego del catálogo a un evento (apagado por defecto). */
  addToEvent(eventId: string, gameId: string, position: number): Promise<EventGame> {
    return this.games.upsertEventGame({
      eventId,
      gameId,
      isEnabled: false,
      position,
      maxPlays: 1,
      config: {},
    })
  }
}
