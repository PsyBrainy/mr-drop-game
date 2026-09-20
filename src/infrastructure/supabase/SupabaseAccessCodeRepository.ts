import type {
  AccessCodeDraft,
  AccessCodeRepository,
  AccessCodeSummary,
} from '../../application/ports/AccessCodeRepository'
import { AccessCode } from '../../domain/access/AccessCode'
import { getSupabase } from './client'
import { toAccessCode } from './mappers'
import { unwrap } from './errors'
import type { AccessCodeRow } from './rows'

const COLUMNS = 'id, code, label, max_uses, used_count, expires_at, is_active'

export class SupabaseAccessCodeRepository implements AccessCodeRepository {
  async listForEvent(eventId: string): Promise<AccessCodeSummary[]> {
    const result = await getSupabase()
      .from('access_codes')
      .select(COLUMNS)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .returns<AccessCodeRow[]>()
    return unwrap(result).map(toAccessCode)
  }

  async create(draft: AccessCodeDraft): Promise<AccessCodeSummary> {
    const code = AccessCode.create(draft.code)
    const result = await getSupabase()
      .from('access_codes')
      .insert({
        event_id: draft.eventId,
        code: code.value,
        label: draft.label,
        max_uses: draft.maxUses,
        expires_at: draft.expiresAt?.toISOString() ?? null,
      })
      .select(COLUMNS)
      .single<AccessCodeRow>()
    return toAccessCode(unwrap(result))
  }

  async setActive(id: string, isActive: boolean): Promise<AccessCodeSummary> {
    const result = await getSupabase()
      .from('access_codes')
      .update({ is_active: isActive })
      .eq('id', id)
      .select(COLUMNS)
      .single<AccessCodeRow>()
    return toAccessCode(unwrap(result))
  }
}
