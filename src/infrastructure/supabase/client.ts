import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { domainError } from '../../domain/shared/DomainError'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const key =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim() ?? ''

/**
 * La app arranca aunque falten las credenciales: la home pública se ve igual
 * y solo las pantallas que tocan datos avisan que falta configurar .env.
 */
export const isSupabaseConfigured =
  url.startsWith('https://') && !url.includes('xxxx') && key.length > 20

let cached: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw domainError(
      'UNEXPECTED',
      'Falta configurar Supabase. Copiá .env.example a .env y completá URL y key.',
    )
  }
  cached ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return cached
}
