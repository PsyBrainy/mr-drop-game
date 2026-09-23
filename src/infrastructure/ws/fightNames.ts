import { getSupabase, isSupabaseConfigured } from '../supabase/client'

/**
 * Los nombres que se muestran en la pelea online. Vive al lado del token porque
 * es la misma frontera: la pelea habla con psy-ws y con Supabase sólo para saber
 * quién es quién, nunca para decidir nada del juego.
 *
 * psy-ws manda el `playerId` del rival: el id de Supabase si entró con sesión, o
 * `invitado-xxxx` si el servidor acepta invitados. Los perfiles son públicos
 * (la política de `profiles` deja leerlos a cualquiera), así que el nombre sale
 * de ahí. Si algo falla, el cartel dice algo razonable en vez de un UUID.
 */

export const GUEST_NAME = 'Invitado'
export const RIVAL_NAME = 'Rival'
export const YOU_NAME = 'Vos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un nombre corto para el cartel sobre la cabeza: si no, tapa medio escenario. */
export function shortName(name: string, max = 16): string {
  const trimmed = name.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

async function displayNameById(id: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('profiles')
    .select('display_name')
    .eq('id', id)
    .maybeSingle<{ display_name: string | null }>()
  const name = data?.display_name?.trim()
  return name ? shortName(name) : null
}

export async function myFightName(): Promise<string> {
  if (!isSupabaseConfigured) return GUEST_NAME
  try {
    const { data } = await getSupabase().auth.getSession()
    const id = data.session?.user.id
    if (!id) return GUEST_NAME
    return (await displayNameById(id)) ?? YOU_NAME
  } catch {
    return YOU_NAME
  }
}

export async function rivalFightName(playerId: string): Promise<string> {
  if (playerId.startsWith('invitado-')) return GUEST_NAME
  if (!isSupabaseConfigured || !UUID.test(playerId)) return RIVAL_NAME
  try {
    return (await displayNameById(playerId)) ?? RIVAL_NAME
  } catch {
    return RIVAL_NAME
  }
}
