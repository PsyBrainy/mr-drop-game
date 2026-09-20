import type { Profile } from '../../domain/user/Profile'

export interface Credentials {
  email: string
  password: string
}

export interface SignUpData extends Credentials {
  displayName: string
}

export interface AuthSnapshot {
  userId: string | null
  profile: Profile | null
}

export interface AuthPort {
  current(): Promise<AuthSnapshot>
  onChange(listener: (snapshot: AuthSnapshot) => void): () => void
  signIn(credentials: Credentials): Promise<void>
  signUp(data: SignUpData): Promise<{ needsEmailConfirmation: boolean }>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  updateDisplayName(displayName: string): Promise<Profile>
}
