import { RedeemAccessCode } from '../application/usecases/RedeemAccessCode'
import { LoadEventBoard } from '../application/usecases/LoadEventBoard'
import { LoadFreePlayBoard } from '../application/usecases/LoadFreePlayBoard'
import { FinishGameSession, PrepareGameEntry, StartGameSession } from '../application/usecases/PlayGame'
import { GetLeaderboard } from '../application/usecases/GetLeaderboard'
import { ManageEventGames } from '../application/usecases/ManageEventGames'
import { SupabaseAuthAdapter } from './supabase/SupabaseAuthAdapter'
import { SupabaseEventRepository } from './supabase/SupabaseEventRepository'
import { SupabaseGameRepository } from './supabase/SupabaseGameRepository'
import { SupabaseParticipationRepository } from './supabase/SupabaseParticipationRepository'
import { SupabaseSessionRepository } from './supabase/SupabaseSessionRepository'
import { SupabaseLeaderboardRepository } from './supabase/SupabaseLeaderboardRepository'
import { SupabaseAccessCodeRepository } from './supabase/SupabaseAccessCodeRepository'
import { SupabaseAddressRepository } from './supabase/SupabaseAddressRepository'
import { NominatimGeocoder } from './nominatim/NominatimGeocoder'
import { SupabaseProductRepository } from './supabase/SupabaseProductRepository'
import { SupabaseOrderRepository } from './supabase/SupabaseOrderRepository'
import { SupabaseDeliveryRepository } from './supabase/SupabaseDeliveryRepository'

/**
 * Único punto donde se cablea infraestructura con casos de uso.
 * La UI solo conoce esta interfaz, así que cambiar Supabase por otra cosa
 * no toca ni el dominio ni las pantallas.
 */
export function createContainer() {
  const auth = new SupabaseAuthAdapter()
  const events = new SupabaseEventRepository()
  const games = new SupabaseGameRepository()
  const participations = new SupabaseParticipationRepository()
  const sessions = new SupabaseSessionRepository()
  const leaderboards = new SupabaseLeaderboardRepository()
  const accessCodes = new SupabaseAccessCodeRepository()
  const addresses = new SupabaseAddressRepository()
  const geocoder = new NominatimGeocoder()
  const products = new SupabaseProductRepository()
  const orders = new SupabaseOrderRepository()
  const delivery = new SupabaseDeliveryRepository()

  return {
    auth,
    geocoder,
    repositories: {
      events,
      games,
      participations,
      sessions,
      leaderboards,
      accessCodes,
      addresses,
      products,
      orders,
      delivery,
    },
    usecases: {
      redeemAccessCode: new RedeemAccessCode(participations),
      loadEventBoard: new LoadEventBoard(events, games, participations),
      loadFreePlayBoard: new LoadFreePlayBoard(events, games, sessions, leaderboards),
      prepareGameEntry: new PrepareGameEntry(games, sessions),
      startGameSession: new StartGameSession(sessions),
      finishGameSession: new FinishGameSession(sessions),
      getLeaderboard: new GetLeaderboard(leaderboards),
      manageEventGames: new ManageEventGames(games),
    },
  }
}

export type Container = ReturnType<typeof createContainer>
