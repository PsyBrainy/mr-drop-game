/**
 * Tipos de respuesta de la API (DTOs). Nunca salen de infraestructura:
 * los mappers los convierten a tipos de dominio.
 */
export interface ProfileRow {
  id: string
  display_name: string
  avatar_url: string | null
  role: 'player' | 'admin' | 'courier'
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
  payload: Record<string, unknown> | null
}

export interface FightLeaderboardRow {
  user_id: string
  display_name: string
  avatar_url: string | null
  wins: number
  losses: number
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

export interface ProductRow {
  id: string
  name: string
  description: string
  price: number | string
  is_active: boolean
  position: number
}

export interface OrderRoundRow {
  id: string
  name: string
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
}

export interface OrderItemRow {
  product_id: string | null
  name: string
  unit_price: number | string
  quantity: number
}

export interface OrderRow {
  id: string
  round_id: string
  user_id: string
  status: 'pending' | 'assigned' | 'on_the_way' | 'delivered' | 'failed' | 'cancelled'
  notes: string
  total: number | string
  lat: number
  lng: number
  address_label: string
  courier_id: string | null
  delivery_fee: number | string
  delivery_inside: boolean | null
  created_at: string
  delivered_at: string | null
  order_items?: OrderItemRow[] | null
  profiles?: Pick<ProfileRow, 'display_name' | 'avatar_url'> | null
}

export interface DeliverySettingsRow {
  fee_inside: number | string
  fee_outside: number | string
  zone: { lat: number; lng: number }[] | null
}

export interface RedeemRow {
  event_id: string
  event_slug: string
  event_name: string
  already_joined: boolean
}
