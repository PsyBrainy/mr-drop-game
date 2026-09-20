import type { EventDraft, EventRepository } from '../../application/ports/EventRepository'
import type { ContestEvent } from '../../domain/event/Event'
import { getSupabase } from './client'
import { toEvent } from './mappers'
import { translateError, unwrap } from './errors'
import type { EventRow } from './rows'

const COLUMNS = 'id, slug, name, description, prize, status, starts_at, ends_at'

const toRow = (patch: Partial<EventDraft>) => ({
  ...(patch.slug !== undefined && { slug: patch.slug }),
  ...(patch.name !== undefined && { name: patch.name }),
  ...(patch.description !== undefined && { description: patch.description }),
  ...(patch.prize !== undefined && { prize: patch.prize }),
  ...(patch.status !== undefined && { status: patch.status }),
  ...(patch.startsAt !== undefined && { starts_at: patch.startsAt?.toISOString() ?? null }),
  ...(patch.endsAt !== undefined && { ends_at: patch.endsAt?.toISOString() ?? null }),
})

export class SupabaseEventRepository implements EventRepository {
  async listPublic(): Promise<ContestEvent[]> {
    const result = await getSupabase()
      .from('events')
      .select(COLUMNS)
      .neq('status', 'draft')
      .order('starts_at', { ascending: false, nullsFirst: false })
      .returns<EventRow[]>()
    return unwrap(result).map(toEvent)
  }

  async listAll(): Promise<ContestEvent[]> {
    const result = await getSupabase()
      .from('events')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .returns<EventRow[]>()
    return unwrap(result).map(toEvent)
  }

  async findBySlug(slug: string): Promise<ContestEvent | null> {
    const { data, error } = await getSupabase()
      .from('events')
      .select(COLUMNS)
      .eq('slug', slug)
      .maybeSingle<EventRow>()
    if (error) throw translateError(error)
    return data ? toEvent(data) : null
  }

  async create(draft: EventDraft): Promise<ContestEvent> {
    const result = await getSupabase()
      .from('events')
      .insert(toRow(draft))
      .select(COLUMNS)
      .single<EventRow>()
    return toEvent(unwrap(result))
  }

  async update(id: string, patch: Partial<EventDraft>): Promise<ContestEvent> {
    const result = await getSupabase()
      .from('events')
      .update(toRow(patch))
      .eq('id', id)
      .select(COLUMNS)
      .single<EventRow>()
    return toEvent(unwrap(result))
  }
}
