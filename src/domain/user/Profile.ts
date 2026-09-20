export type AppRole = 'player' | 'admin'

export interface Profile {
  readonly id: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly role: AppRole
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === 'admin'
}

export function initialsOf(profile: Profile): string {
  const source = profile.displayName.trim() || 'Dropper'
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}
