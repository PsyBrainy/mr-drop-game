import type { ContestEvent } from '../../domain/event/Event'
import type { EventGame, Game } from '../../domain/game/Game'
import type { LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'
import type { FightRecord } from '../../domain/fight/FightRecord'
import type { GameSession } from '../../domain/session/GameSession'
import type { Profile } from '../../domain/user/Profile'
import type { UserAddress } from '../../domain/user/UserAddress'
import type { AddressWithProfile } from '../../application/ports/AddressRepository'
import type { OrderWithProfile } from '../../application/ports/OrderRepository'
import type { Product } from '../../domain/order/Product'
import type { Order, OrderItem, OrderRound } from '../../domain/order/Order'
import type { DeliverySettings } from '../../domain/order/Delivery'
import type { AccessCodeSummary } from '../../application/ports/AccessCodeRepository'
import type {
  AccessCodeRow,
  EventGameRow,
  EventRow,
  GameRow,
  GameSessionRow,
  LeaderboardRow,
  FightLeaderboardRow,
  DeliverySettingsRow,
  OrderItemRow,
  OrderRoundRow,
  OrderRow,
  ProductRow,
  ProfileRow,
  UserAddressRow,
} from './rows'

const toDate = (value: string | null): Date | null => (value ? new Date(value) : null)

export const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  role: row.role,
})

export const toEvent = (row: EventRow): ContestEvent => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  prize: row.prize,
  status: row.status,
  startsAt: toDate(row.starts_at),
  endsAt: toDate(row.ends_at),
  isFreePlay: row.is_free_play,
})

export const toGame = (row: GameRow): Game => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  coverUrl: row.cover_url,
  engine: row.engine,
})

export const toEventGame = (row: EventGameRow): EventGame => {
  if (!row.games) {
    throw new Error(`event_game ${row.id} sin juego asociado`)
  }
  return {
    id: row.id,
    eventId: row.event_id,
    game: toGame(row.games),
    isEnabled: row.is_enabled,
    position: row.position,
    maxPlays: row.max_plays,
    config: row.config ?? {},
  }
}

export const toSession = (row: GameSessionRow): GameSession => ({
  id: row.id,
  eventGameId: row.event_game_id,
  status: row.status,
  score: row.score,
  startedAt: new Date(row.started_at),
  finishedAt: toDate(row.finished_at),
})

export const toLeaderboardEntry = (row: LeaderboardRow): LeaderboardEntry => ({
  userId: row.user_id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  gameSlug: row.game_slug,
  bestScore: row.best_score,
  firstFinishedAt: toDate(row.first_finished_at),
  plays: row.plays,
  payload: row.payload ?? undefined,
})

export const toFightRecord = (row: FightLeaderboardRow): FightRecord => ({
  userId: row.user_id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  wins: row.wins,
  losses: row.losses,
})

export const toAccessCode = (row: AccessCodeRow): AccessCodeSummary => ({
  id: row.id,
  code: row.code,
  label: row.label,
  maxUses: row.max_uses,
  usedCount: row.used_count,
  expiresAt: toDate(row.expires_at),
  isActive: row.is_active,
})

export const toUserAddress = (row: UserAddressRow): UserAddress => ({
  userId: row.user_id,
  lat: row.lat,
  lng: row.lng,
  label: row.label,
  updatedAt: new Date(row.updated_at),
})

export const toAddressWithProfile = (row: UserAddressRow): AddressWithProfile => ({
  ...toUserAddress(row),
  displayName: row.profiles?.display_name ?? 'Dropper',
  avatarUrl: row.profiles?.avatar_url ?? null,
})

// numeric llega como string por PostgREST.
const toNumber = (value: number | string): number => Number(value)

export const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  description: row.description,
  price: toNumber(row.price),
  isActive: row.is_active,
  position: row.position,
})

export const toOrderRound = (row: OrderRoundRow): OrderRound => ({
  id: row.id,
  name: row.name,
  status: row.status,
  openedAt: new Date(row.opened_at),
  closedAt: toDate(row.closed_at),
})

const toOrderItem = (row: OrderItemRow): OrderItem => ({
  productId: row.product_id,
  name: row.name,
  unitPrice: toNumber(row.unit_price),
  quantity: row.quantity,
})

export const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  roundId: row.round_id,
  userId: row.user_id,
  status: row.status,
  notes: row.notes,
  total: toNumber(row.total),
  deliveryFee: toNumber(row.delivery_fee ?? 0),
  deliveryInside: row.delivery_inside,
  lat: row.lat,
  lng: row.lng,
  addressLabel: row.address_label,
  items: (row.order_items ?? []).map(toOrderItem),
  createdAt: new Date(row.created_at),
  deliveredAt: toDate(row.delivered_at),
})

export const toOrderWithProfile = (row: OrderRow): OrderWithProfile => ({
  ...toOrder(row),
  displayName: row.profiles?.display_name ?? 'Dropper',
  avatarUrl: row.profiles?.avatar_url ?? null,
})

export const toDeliverySettings = (row: DeliverySettingsRow): DeliverySettings => ({
  feeInside: toNumber(row.fee_inside),
  feeOutside: toNumber(row.fee_outside),
  zone: (row.zone ?? []).map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) })),
})
