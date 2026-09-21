import { describe, expect, it } from 'vitest'
import { AccessCode } from '../access/AccessCode'
import { DomainError } from '../shared/DomainError'
import { hasEnded, isOpen, isUpcoming, type ContestEvent } from '../event/Event'
import { positionOf, rank } from '../leaderboard/LeaderboardEntry'
import { generalRanking } from '../leaderboard/GeneralRanking'
import { sanitizeScore, MAX_SCORE } from '../session/GameSession'
import { playsLeft, sortByPosition, type EventGame } from '../game/Game'

describe('AccessCode', () => {
  it('normaliza espacios y minúsculas', () => {
    expect(AccessCode.create(' mr drop24 ').value).toBe('MRDROP24')
  })

  it('acepta guiones y dígitos', () => {
    expect(AccessCode.create('drop-2024').value).toBe('DROP-2024')
  })

  it('rechaza códigos cortos o con símbolos', () => {
    expect(() => AccessCode.create('ab')).toThrow(DomainError)
    expect(() => AccessCode.create('drop!24')).toThrow(DomainError)
    expect(AccessCode.isValid('')).toBe(false)
  })
})

const baseEvent = (patch: Partial<ContestEvent> = {}): ContestEvent => ({
  id: 'e1',
  slug: 'drop',
  name: 'Drop',
  description: '',
  prize: '',
  status: 'live',
  isFreePlay: false,
  startsAt: null,
  endsAt: null,
  ...patch,
})

describe('ContestEvent', () => {
  const now = new Date('2026-09-20T12:00:00Z')

  it('solo está abierto si está live y dentro de la ventana', () => {
    expect(isOpen(baseEvent(), now)).toBe(true)
    expect(isOpen(baseEvent({ status: 'draft' }), now)).toBe(false)
    expect(isOpen(baseEvent({ startsAt: new Date('2026-09-21') }), now)).toBe(false)
    expect(isOpen(baseEvent({ endsAt: new Date('2026-09-19') }), now)).toBe(false)
  })

  it('distingue próximo de terminado', () => {
    expect(isUpcoming(baseEvent({ startsAt: new Date('2026-09-21') }), now)).toBe(true)
    expect(hasEnded(baseEvent({ endsAt: new Date('2026-09-19') }), now)).toBe(true)
    expect(hasEnded(baseEvent({ status: 'closed' }), now)).toBe(true)
  })
})

describe('leaderboard', () => {
  const entry = (userId: string, bestScore: number, at: string | null) => ({
    userId,
    displayName: userId,
    avatarUrl: null,
    gameSlug: 'mrdrop-run',
    bestScore,
    firstFinishedAt: at ? new Date(at) : null,
    plays: 1,
  })

  it('ordena por puntaje y desempata por quién llegó antes', () => {
    const ordered = rank([
      entry('b', 10, '2026-09-20T10:00:00Z'),
      entry('a', 10, '2026-09-20T09:00:00Z'),
      entry('c', 20, '2026-09-20T11:00:00Z'),
    ])
    expect(ordered.map((e) => e.userId)).toEqual(['c', 'a', 'b'])
  })

  it('manda al final a quien no tiene fecha', () => {
    const ordered = rank([entry('sin-fecha', 5, null), entry('con-fecha', 5, '2026-09-20T10:00:00Z')])
    expect(ordered[0]?.userId).toBe('con-fecha')
  })

  it('calcula la posición del usuario', () => {
    const entries = [entry('a', 5, null), entry('b', 9, null)]
    expect(positionOf(entries, 'a')).toBe(2)
    expect(positionOf(entries, 'z')).toBeNull()
  })
})

describe('score', () => {
  it('acota el puntaje que llega del motor', () => {
    expect(sanitizeScore(-5)).toBe(0)
    expect(sanitizeScore(12.9)).toBe(12)
    expect(sanitizeScore(Number.POSITIVE_INFINITY)).toBe(0)
    expect(sanitizeScore(NaN)).toBe(0)
    expect(sanitizeScore(MAX_SCORE * 10)).toBe(MAX_SCORE)
  })
})

describe('EventGame', () => {
  const eventGame = (id: string, position: number, name: string, maxPlays = 3): EventGame => ({
    id,
    eventId: 'e1',
    game: { id, slug: id, name, description: '', coverUrl: null, engine: 'kaplay' },
    isEnabled: true,
    position,
    maxPlays,
    config: {},
  })

  it('ordena por posición y desempata alfabéticamente', () => {
    const sorted = sortByPosition([eventGame('c', 1, 'C'), eventGame('a', 0, 'A'), eventGame('b', 0, 'B')])
    expect(sorted.map((g) => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('nunca devuelve intentos negativos', () => {
    expect(playsLeft(eventGame('a', 0, 'A', 3), 5)).toBe(0)
    expect(playsLeft(eventGame('a', 0, 'A', 3), 1)).toBe(2)
  })

  it('en juego libre los intentos son ilimitados', () => {
    expect(playsLeft(eventGame('a', 0, 'A', 1), 99, true)).toBeNull()
  })
})

describe('ranking general', () => {
  const entry = (userId: string, gameSlug: string, bestScore: number, at: string) => ({
    userId,
    displayName: userId,
    avatarUrl: null,
    gameSlug,
    bestScore,
    firstFinishedAt: new Date(at),
    plays: 1,
  })

  it('suma el récord de cada juego por usuario', () => {
    const board = generalRanking([
      entry('ana', 'run', 100, '2026-01-01T10:00:00Z'),
      entry('ana', 'jump', 50, '2026-01-02T10:00:00Z'),
      entry('beto', 'run', 120, '2026-01-01T09:00:00Z'),
    ])
    expect(board.map((e) => [e.userId, e.totalScore, e.gamesPlayed])).toEqual([
      ['ana', 150, 2],
      ['beto', 120, 1],
    ])
  })

  it('a igual total gana quien completó su marca antes', () => {
    const board = generalRanking([
      entry('ana', 'run', 100, '2026-01-03T10:00:00Z'),
      entry('beto', 'run', 60, '2026-01-01T10:00:00Z'),
      entry('beto', 'jump', 40, '2026-01-02T10:00:00Z'),
    ])
    expect(board.map((e) => e.userId)).toEqual(['beto', 'ana'])
  })
})
