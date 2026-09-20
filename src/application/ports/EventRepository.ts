import type { ContestEvent, EventStatus } from '../../domain/event/Event'

export interface EventDraft {
  slug: string
  name: string
  description: string
  prize: string
  status: EventStatus
  startsAt: Date | null
  endsAt: Date | null
}

export interface EventRepository {
  /** Eventos visibles en la home (no borradores). */
  listPublic(): Promise<ContestEvent[]>
  /** Todos, incluidos borradores. Requiere admin (lo resuelve RLS). */
  listAll(): Promise<ContestEvent[]>
  findBySlug(slug: string): Promise<ContestEvent | null>
  create(draft: EventDraft): Promise<ContestEvent>
  update(id: string, patch: Partial<EventDraft>): Promise<ContestEvent>
}
