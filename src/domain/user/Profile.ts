/** courier: repartidor. Se asigna a mano desde el dashboard de Supabase, como admin. */
export type AppRole = 'player' | 'admin' | 'courier'

export interface Profile {
  readonly id: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly role: AppRole
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === 'admin'
}

export function isCourier(profile: Profile | null): boolean {
  return profile?.role === 'courier'
}

export function initialsOf(profile: Profile): string {
  const source = profile.displayName.trim() || 'Dropper'
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}
