import type { Coordinates, UserAddress } from '../../domain/user/UserAddress'

export interface SaveAddressInput extends Coordinates {
  label: string
}

/** Dirección junto con el perfil del dueño, para el listado del admin. */
export interface AddressWithProfile extends UserAddress {
  displayName: string
  avatarUrl: string | null
}

export interface AddressRepository {
  getMine(): Promise<UserAddress | null>
  saveMine(input: SaveAddressInput): Promise<UserAddress>
  deleteMine(): Promise<void>
  /** Solo admin: RLS devuelve vacío para el resto. */
  listAll(): Promise<AddressWithProfile[]>
}
