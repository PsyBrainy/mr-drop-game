import type {
  AddressRepository,
  AddressWithProfile,
  SaveAddressInput,
} from '../../application/ports/AddressRepository'
import { domainError } from '../../domain/shared/DomainError'
import { isValidCoordinates, MAX_ADDRESS_LABEL, type UserAddress } from '../../domain/user/UserAddress'
import { getSupabase } from './client'
import { translateError, unwrap } from './errors'
import { toAddressWithProfile, toUserAddress } from './mappers'
import type { UserAddressRow } from './rows'

const COLUMNS = 'user_id, lat, lng, label, updated_at'

export class SupabaseAddressRepository implements AddressRepository {
  async getMine(): Promise<UserAddress | null> {
    const userId = await currentUserId()
    const result = await getSupabase()
      .from('user_addresses')
      .select(COLUMNS)
      .eq('user_id', userId)
      .maybeSingle<UserAddressRow>()
    if (result.error) throw translateError(result.error)
    return result.data ? toUserAddress(result.data) : null
  }

  async saveMine(input: SaveAddressInput): Promise<UserAddress> {
    if (!isValidCoordinates(input)) throw domainError('UNEXPECTED', 'Coordenadas fuera de rango.')
    const userId = await currentUserId()
    const result = await getSupabase()
      .from('user_addresses')
      .upsert(
        { user_id: userId, lat: input.lat, lng: input.lng, label: input.label.trim().slice(0, MAX_ADDRESS_LABEL) },
        { onConflict: 'user_id' },
      )
      .select(COLUMNS)
      .single<UserAddressRow>()
    return toUserAddress(unwrap(result))
  }

  async deleteMine(): Promise<void> {
    const userId = await currentUserId()
    const { error } = await getSupabase().from('user_addresses').delete().eq('user_id', userId)
    if (error) throw translateError(error)
  }

  async listAll(): Promise<AddressWithProfile[]> {
    const result = await getSupabase()
      .from('user_addresses')
      .select(`${COLUMNS}, profiles (display_name, avatar_url)`)
      .order('updated_at', { ascending: false })
      .returns<UserAddressRow[]>()
    return unwrap(result).map(toAddressWithProfile)
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw domainError('AUTH_REQUIRED')
  return userId
}
