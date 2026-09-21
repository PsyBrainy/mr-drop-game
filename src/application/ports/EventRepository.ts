import type { ContestEvent, EventStatus } from '../../domain/event/Event'

export interface EventDraft {
  slug: string
  name: string
  description: string
  prize: string
  status: EventStatus
  startsAt: Date | null
  endsAt: Date | null
  isFreePlay: boolean
}

export interface EventRepository {
  /** Concursos visibles en la home (no borradores, sin la sección de juego libre). */
  listPublic(): Promise<ContestEvent[]>
  /** La sección de juego libre en vivo, si el admin la publicó. */
  findFreePlay(): Promise<ContestEvent | null>
  /** Todos, incluidos borradores. Requiere admin (lo resuelve RLS). */
  listAll(): Promise<ContestEvent[]>
  findBySlug(slug: string): Promise<ContestEvent | null>
  create(draft: EventDraft): Promise<ContestEvent>
  update(id: string, patch: Partial<EventDraft>): Promise<ContestEvent>
  /** Solo admin. Se lleva códigos, participaciones y partidas en cascada. */
  delete(id: string): Promise<void>
}
