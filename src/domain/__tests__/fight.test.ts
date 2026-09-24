import { describe, expect, it } from 'vitest'
import { fightPositionOf, rankFights, type FightRecord } from '../fight/FightRecord'
import { GetFightBoard } from '../../application/usecases/GetFightBoard'

const record = (userId: string, wins: number, losses: number, displayName = userId): FightRecord => ({
  userId,
  displayName,
  avatarUrl: null,
  wins,
  losses,
})

describe('el ranking de peleas', () => {
  it('más ganadas primero', () => {
    const ranked = rankFights([record('a', 2, 0), record('b', 7, 3), record('c', 4, 1)])
    expect(ranked.map((r) => r.userId)).toEqual(['b', 'c', 'a'])
  })

  it('a igual de ganadas, el que perdió menos', () => {
    const ranked = rankFights([record('a', 5, 7), record('b', 5, 0)])
    expect(ranked.map((r) => r.userId)).toEqual(['b', 'a'])
  })

  it('empate total: por nombre, para que no salte de lugar', () => {
    const ranked = rankFights([record('z', 3, 1, 'Zoe'), record('y', 3, 1, 'Ana')])
    expect(ranked.map((r) => r.displayName)).toEqual(['Ana', 'Zoe'])
  })

  it('el puesto propio, o nada si no peleó', () => {
    const ranked = rankFights([record('a', 1, 0), record('b', 3, 0)])
    expect(fightPositionOf(ranked, 'a')).toBe(2)
    expect(fightPositionOf(ranked, 'x')).toBeNull()
  })
})

describe('el tablero', () => {
  const all = [record('a', 9, 0), record('b', 8, 0), record('c', 7, 0), record('me', 1, 5)]
  const board = new GetFightBoard({ forEventGame: async () => all })

  it('muestra los primeros y además mi fila aunque esté más abajo', async () => {
    const result = await board.forEventGame('eg', 'me', 2)
    expect(result.top.map((r) => r.userId)).toEqual(['a', 'b'])
    expect(result.myPosition).toBe(4)
    expect(result.mine?.userId).toBe('me')
  })

  it('sin sesión no hay fila propia', async () => {
    const result = await board.forEventGame('eg', null)
    expect(result.mine).toBeNull()
    expect(result.myPosition).toBeNull()
  })
})
