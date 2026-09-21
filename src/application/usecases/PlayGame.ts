import { domainError } from '../../domain/shared/DomainError'
import { sanitizeScore, type GameSession } from '../../domain/session/GameSession'
import type { ContestEvent } from '../../domain/event/Event'
import { playsLeft, type EventGame } from '../../domain/game/Game'
import type { GameRepository } from '../ports/GameRepository'
import type { SessionRepository } from '../ports/SessionRepository'

export interface GameEntry {
  eventGame: EventGame
  playsUsed: number
  /** `null` = ilimitado (juego libre). */
  playsLeft: number | null
  bestScore: number | null
}

/** Prepara la pantalla de juego: valida habilitación e intentos antes de montar el canvas. */
export class PrepareGameEntry {
  constructor(
    private readonly games: GameRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(event: ContestEvent, gameSlug: string): Promise<GameEntry> {
    const eventGame = await this.games.findEventGame(event.id, gameSlug)
    if (!eventGame || !eventGame.isEnabled) throw domainError('GAME_DISABLED')

    const [playsUsed, bestScore] = await Promise.all([
      this.sessions.countPlays(eventGame.id),
      this.sessions.myBestScore(eventGame.id),
    ])

    return {
      eventGame,
      playsUsed,
      playsLeft: playsLeft(eventGame, playsUsed, event.isFreePlay),
      bestScore,
    }
  }
}

export class StartGameSession {
  constructor(private readonly sessions: SessionRepository) {}

  execute(eventGameId: string): Promise<GameSession> {
    return this.sessions.start(eventGameId)
  }
}

export class FinishGameSession {
  constructor(private readonly sessions: SessionRepository) {}

  /** El score llega del motor del juego: se acota antes de mandarlo. */
  execute(sessionId: string, rawScore: number, payload?: Record<string, unknown>): Promise<GameSession> {
    return this.sessions.finish(sessionId, sanitizeScore(rawScore), payload)
  }
}
