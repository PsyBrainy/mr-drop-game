import { fightPositionOf, rankFights, type FightRecord } from '../../domain/fight/FightRecord'
import type { FightBoardRepository } from '../ports/FightBoardRepository'

export interface FightBoard {
  /** Los primeros del ranking, ya ordenados. */
  readonly top: FightRecord[]
  /** La fila del usuario, esté o no entre los primeros. */
  readonly mine: FightRecord | null
  readonly myPosition: number | null
}

export class GetFightBoard {
  constructor(private readonly boards: FightBoardRepository) {}

  async forEventGame(eventGameId: string, userId: string | null, limit = 20): Promise<FightBoard> {
    // Se trae todo y se ordena acá: el puesto propio tiene que ser el de verdad
    // aunque el usuario esté fuera de los primeros.
    const ranked = rankFights(await this.boards.forEventGame(eventGameId))
    const myPosition = userId ? fightPositionOf(ranked, userId) : null
    return {
      top: ranked.slice(0, limit),
      mine: myPosition === null ? null : ranked[myPosition - 1]!,
      myPosition,
    }
  }
}
