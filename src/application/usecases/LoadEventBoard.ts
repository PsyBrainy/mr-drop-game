import { isOpen, type ContestEvent } from '../../domain/event/Event'
import { sortByPosition, type EventGame } from '../../domain/game/Game'
import { domainError } from '../../domain/shared/DomainError'
import type { EventRepository } from '../ports/EventRepository'
import type { GameRepository } from '../ports/GameRepository'
import type { ParticipationRepository } from '../ports/ParticipationRepository'

export interface EventBoard {
  event: ContestEvent
  games: EventGame[]
  isParticipant: boolean
  isOpen: boolean
}

/** Arma la pantalla de un concurso: datos, juegos habilitados y si el usuario está adentro. */
export class LoadEventBoard {
  constructor(
    private readonly events: EventRepository,
    private readonly games: GameRepository,
    private readonly participations: ParticipationRepository,
  ) {}

  async execute(slug: string, options: { authenticated: boolean }): Promise<EventBoard> {
    const event = await this.events.findBySlug(slug)
    if (!event) throw domainError('EVENT_CLOSED', 'No encontramos ese concurso.')

    const [games, isParticipant] = await Promise.all([
      this.games.listForEvent(event.id),
      options.authenticated ? this.participations.isParticipant(event.id) : Promise.resolve(false),
    ])

    return {
      event,
      games: sortByPosition(games.filter((game) => game.isEnabled)),
      isParticipant,
      isOpen: isOpen(event),
    }
  }
}
