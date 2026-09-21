import type { ContestEvent } from '../../domain/event/Event'
import { sortByPosition, type EventGame } from '../../domain/game/Game'
import { generalRanking, type GeneralRankingEntry } from '../../domain/leaderboard/GeneralRanking'
import { rank, type LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'
import type { EventRepository } from '../ports/EventRepository'
import type { GameRepository } from '../ports/GameRepository'
import type { LeaderboardRepository } from '../ports/LeaderboardRepository'
import type { SessionRepository } from '../ports/SessionRepository'

export interface FreePlayGame {
  eventGame: EventGame
  /** Récord personal del usuario logueado; null si no jugó o no hay sesión. */
  myBest: number | null
  ranking: LeaderboardEntry[]
}

export interface FreePlayBoard {
  event: ContestEvent
  games: FreePlayGame[]
  general: GeneralRankingEntry[]
}

const RANKING_PER_GAME = 10
const GENERAL_LIMIT = 200

/**
 * Arma la sección de juego libre: juegos habilitados, récord personal y
 * ranking por juego, más el ranking general (suma de récords). Devuelve null
 * si el admin no publicó la sección.
 */
export class LoadFreePlayBoard {
  constructor(
    private readonly events: EventRepository,
    private readonly games: GameRepository,
    private readonly sessions: SessionRepository,
    private readonly leaderboards: LeaderboardRepository,
  ) {}

  async execute(options: { authenticated: boolean }): Promise<FreePlayBoard | null> {
    const event = await this.events.findFreePlay()
    if (!event) return null

    const [assigned, allEntries] = await Promise.all([
      this.games.listForEvent(event.id),
      this.leaderboards.forEvent(event.id, GENERAL_LIMIT),
    ])
    const enabled = sortByPosition(assigned.filter((game) => game.isEnabled))

    const games = await Promise.all(
      enabled.map(async (eventGame): Promise<FreePlayGame> => {
        const [myBest, ranking] = await Promise.all([
          options.authenticated ? this.sessions.myBestScore(eventGame.id) : Promise.resolve(null),
          this.leaderboards.forEventGame(eventGame.id, RANKING_PER_GAME),
        ])
        return { eventGame, myBest, ranking: rank(ranking) }
      }),
    )

    return { event, games, general: generalRanking(allEntries) }
  }
}
