import type {
  ParticipationRepository,
  RedeemResult,
} from '../../application/ports/ParticipationRepository'
import { getSupabase } from './client'
import { translateError } from './errors'
import type { RedeemRow } from './rows'

export class SupabaseParticipationRepository implements ParticipationRepository {
  async redeem(code: string): Promise<RedeemResult> {
    const { data, error } = await getSupabase().rpc('redeem_access_code', { p_code: code })
    if (error) throw translateError(error)

    const row = (data as RedeemRow[] | null)?.[0]
    if (!row) throw translateError({ message: 'CODE_INVALID' })

    return {
      eventId: row.event_id,
      eventSlug: row.event_slug,
      eventName: row.event_name,
      alreadyJoined: row.already_joined,
    }
  }

  async isParticipant(eventId: string): Promise<boolean> {
    const { count, error } = await getSupabase()
      .from('participations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
    if (error) throw translateError(error)
    return (count ?? 0) > 0
  }

  async listMyEventIds(): Promise<string[]> {
    const { data, error } = await getSupabase()
      .from('participations')
      .select('event_id')
      .returns<{ event_id: string }[]>()
    if (error) throw translateError(error)
    return (data ?? []).map((row) => row.event_id)
  }
}
