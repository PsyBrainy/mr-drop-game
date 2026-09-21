import type { ContestEvent } from '../../domain/event/Event'
import type { EventGame, Game } from '../../domain/game/Game'
import type { LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'
import type { GameSession } from '../../domain/session/GameSession'
import type { Profile } from '../../domain/user/Profile'
import type { UserAddress } from '../../domain/user/UserAddress'
import type { AddressWithProfile } from '../../application/ports/AddressRepository'
import type { AccessCodeSummary } from '../../application/ports/AccessCodeRepository'
import type {
  AccessCodeRow,
  EventGameRow,
  EventRow,
  GameRow,
  GameSessionRow,
  LeaderboardRow,
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
