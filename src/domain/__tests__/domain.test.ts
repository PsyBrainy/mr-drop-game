import { describe, expect, it } from 'vitest'
import { AccessCode } from '../access/AccessCode'
import { DomainError } from '../shared/DomainError'
import { hasEnded, isOpen, isUpcoming, type ContestEvent } from '../event/Event'
import { positionOf, rank } from '../leaderboard/LeaderboardEntry'
import { generalRanking } from '../leaderboard/GeneralRanking'
import { sanitizeScore, MAX_SCORE } from '../session/GameSession'
import { playsLeft, sortByPosition, type EventGame } from '../game/Game'
import { isValidCoordinates, wazeNavigationUrl } from '../user/UserAddress'
import { draftTotal, isRoundOpen, itemCount, normalizeDraft, MAX_ITEM_QUANTITY } from '../order/Order'
import { isInsideZone, quoteDelivery } from '../order/Delivery'

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

describe('UserAddress', () => {
  it('arma el deep link de Waze con navegación activada', () => {
    expect(wazeNavigationUrl({ lat: -34.6037, lng: -58.3816 })).toBe(
      'https://waze.com/ul?ll=-34.603700,-58.381600&navigate=yes',
    )
  })

  it('rechaza coordenadas fuera de rango', () => {
    expect(isValidCoordinates({ lat: 91, lng: 0 })).toBe(false)
    expect(isValidCoordinates({ lat: 0, lng: -181 })).toBe(false)
    expect(isValidCoordinates({ lat: Number.NaN, lng: 0 })).toBe(false)
    expect(() => wazeNavigationUrl({ lat: 100, lng: 0 })).toThrow(RangeError)
  })
})

describe('Order', () => {
  const prices = new Map([
    ['a', 1500],
    ['b', 2000],
  ])

  it('suma el total del borrador con los precios del catálogo', () => {
    expect(draftTotal([{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 1 }], prices)).toBe(5000)
  })

  it('ignora productos que ya no están en el catálogo', () => {
    expect(draftTotal([{ productId: 'zzz', quantity: 3 }], prices)).toBe(0)
  })

  it('normaliza el borrador: saca ceros y topea cantidades', () => {
    const lines = normalizeDraft([
      { productId: 'a', quantity: 0 },
      { productId: 'b', quantity: 500 },
      { productId: 'c', quantity: 1.5 },
    ])
    expect(lines).toEqual([{ productId: 'b', quantity: MAX_ITEM_QUANTITY }])
  })

  it('cuenta unidades y reconoce camadas abiertas', () => {
    expect(itemCount({ items: [{ productId: 'a', name: 'A', unitPrice: 1, quantity: 2 }, { productId: 'b', name: 'B', unitPrice: 1, quantity: 3 }] })).toBe(5)
    expect(isRoundOpen(null)).toBe(false)
    expect(isRoundOpen({ id: 'r', name: '', status: 'open', openedAt: new Date(), closedAt: null })).toBe(true)
    expect(isRoundOpen({ id: 'r', name: '', status: 'closed', openedAt: new Date(), closedAt: new Date() })).toBe(false)
  })
})

describe('Delivery', () => {
  // Casco urbano de La Plata: vértices N, E, S, O.
  const casco = [
    { lat: -34.8875541, lng: -57.9534794 },
    { lat: -34.9175123, lng: -57.9131216 },
    { lat: -34.9539303, lng: -57.9530324 },
    { lat: -34.9225633, lng: -57.9940849 },
  ]

  it('Plaza Moreno está adentro del casco', () => {
    expect(isInsideZone({ lat: -34.9214, lng: -57.9544 }, casco)).toBe(true)
  })

  it('Villa Elvira (81 y 120) y City Bell están afuera', () => {
    expect(isInsideZone({ lat: -34.9265, lng: -57.9059 }, casco)).toBe(false)
    expect(isInsideZone({ lat: -34.87, lng: -58.04 }, casco)).toBe(false)
  })

  it('sin zona definida todo cuenta como adentro', () => {
    expect(isInsideZone({ lat: 0, lng: 0 }, [])).toBe(true)
    expect(isInsideZone({ lat: 0, lng: 0 }, casco.slice(0, 2))).toBe(true)
  })

  it('cotiza según la zona', () => {
    const settings = { feeInside: 1000, feeOutside: 2500, zone: casco }
    expect(quoteDelivery({ lat: -34.9214, lng: -57.9544 }, settings)).toEqual({ inside: true, fee: 1000 })
    expect(quoteDelivery({ lat: -34.9265, lng: -57.9059 }, settings)).toEqual({ inside: false, fee: 2500 })
  })
})
