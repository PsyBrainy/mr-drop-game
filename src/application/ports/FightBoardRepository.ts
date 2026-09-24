import type { FightRecord } from '../../domain/fight/FightRecord'

export interface FightBoardRepository {
  /** Ganadas y perdidas de todos los que pelearon en este juego de concurso. */
  forEventGame(eventGameId: string): Promise<FightRecord[]>
}
