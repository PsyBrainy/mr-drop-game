/**
 * Tipos de respuesta de la API (DTOs). Nunca salen de infraestructura:
 * los mappers los convierten a tipos de dominio.
 */
export interface ProfileRow {
  id: string
  display_name: string
  avatar_url: string | null
  role: 'player' | 'admin'
}

export interface EventRow {
  id: string
  slug: string
  name: string
  description: string
  prize: string
  status: 'draft' | 'live' | 'closed'
  starts_at: string | null
  ends_at: string | null
  is_free_play: boolean
}

export interface GameRow {
  id: string
  slug: string
  name: string
  description: string
  cover_url: string | null
  engine: string
}

export interface EventGameRow {
  id: string
  event_id: string
  game_id: string
  is_enabled: boolean
  position: number
  max_plays: number
  config: Record<string, unknown>
  games: GameRow | null
}

export interface GameSessionRow {
  id: string
  event_game_id: string
  status: 'playing' | 'finished' | 'abandoned'
  score: number
  started_at: string
  finished_at: string | null
}

export interface LeaderboardRow {
  event_id: string
  event_game_id: string
  game_slug: string
  user_id: string
  display_name: string
  avatar_url: string | null
  best_score: number
  first_finished_at: string | null
  plays: number
}

export interface AccessCodeRow {
  id: string
  code: string
  label: string
  max_uses: number
  used_count: number
  expires_at: string | null
  is_active: boolean
}

export interface UserAddressRow {
  user_id: string
  lat: number
  lng: number
  label: string
  updated_at: string
  profiles?: Pick<ProfileRow, 'display_name' | 'avatar_url'> | null
}

export interface RedeemRow {
  event_id: string
  event_slug: string
  event_name: string
  already_joined: boolean
}
