import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Credentials, SignUpData } from '../../application/ports/AuthPort'
import { isAdmin, type Profile } from '../../domain/user/Profile'
import { isSupabaseConfigured } from '../../infrastructure/supabase/client'
import { useContainer } from './ContainerProvider'
import { analytics } from '../../infrastructure/analytics'

interface AuthState {
  userId: string | null
  profile: Profile | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  signIn(credentials: Credentials): Promise<void>
  signUp(data: SignUpData): Promise<{ needsEmailConfirmation: boolean }>
  signOut(): Promise<void>
  refresh(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useContainer()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const snapshot = await auth.current()
    setUserId(snapshot.userId)
    setProfile(snapshot.profile)
  }, [auth])

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let active = true
    void auth
      .current()
      .then((snapshot) => {
        if (!active) return
        setUserId(snapshot.userId)
        setProfile(snapshot.profile)
      })
      .finally(() => active && setLoading(false))

    const unsubscribe = auth.onChange((snapshot) => {
      if (!active) return
      setUserId(snapshot.userId)
      setProfile(snapshot.profile)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [auth])

  const value: AuthState = {
    userId,
    profile,
    loading,
    isAuthenticated: userId !== null,
    isAdmin: isAdmin(profile),
    signIn: async (credentials) => {
      try {
        await auth.signIn(credentials)
      } catch (error) {
        analytics.track('login_failed', { method: 'email' })
        throw error
      }
      analytics.track('login', { method: 'email' })
      await refresh()
    },
    signUp: async (data) => {
      const result = await auth.signUp(data)
      analytics.track('sign_up', { method: 'email', needs_confirmation: result.needsEmailConfirmation })
      return result
    },
    signOut: async () => {
      analytics.track('logout', {})
      await auth.signOut()
      setUserId(null)
      setProfile(null)
    },
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return state
}
