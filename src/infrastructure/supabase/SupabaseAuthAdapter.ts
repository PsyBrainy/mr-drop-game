import type { AuthPort, AuthSnapshot, Credentials, SignUpData } from '../../application/ports/AuthPort'
import type { Profile } from '../../domain/user/Profile'
import { domainError } from '../../domain/shared/DomainError'
import { getSupabase } from './client'
import { toProfile } from './mappers'
import { translateError } from './errors'
import type { ProfileRow } from './rows'

const EMPTY: AuthSnapshot = { userId: null, profile: null }

export class SupabaseAuthAdapter implements AuthPort {
  async current(): Promise<AuthSnapshot> {
    const supabase = getSupabase()
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id ?? null
    if (!userId) return EMPTY
    return { userId, profile: await this.loadProfile(userId) }
  }

  onChange(listener: (snapshot: AuthSnapshot) => void): () => void {
    const supabase = getSupabase()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      if (!userId) {
        listener(EMPTY)
        return
      }
      // No se puede await dentro del callback de Supabase: se difiere la carga.
      setTimeout(() => {
        void this.loadProfile(userId).then((profile) => listener({ userId, profile }))
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  }

  async signIn({ email, password }: Credentials): Promise<void> {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) {
      throw domainError('AUTH_REQUIRED', 'Email o contraseña incorrectos.')
    }
  }

  async signUp({ email, password, displayName }: SignUpData): Promise<{ needsEmailConfirmation: boolean }> {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw domainError('UNEXPECTED', error.message)
    return { needsEmailConfirmation: !data.session }
  }

  async signOut(): Promise<void> {
    await getSupabase().auth.signOut()
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/cuenta`,
    })
    if (error) throw translateError(error)
  }

  async updateDisplayName(displayName: string): Promise<Profile> {
    const supabase = getSupabase()
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw domainError('AUTH_REQUIRED')

    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', userId)
      .select('id, display_name, avatar_url, role')
      .single<ProfileRow>()

    if (error) throw translateError(error)
    return toProfile(data)
  }

  private async loadProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('id, display_name, avatar_url, role')
      .eq('id', userId)
      .maybeSingle<ProfileRow>()

    if (error || !data) return null
    return toProfile(data)
  }
}
