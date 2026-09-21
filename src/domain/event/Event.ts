export type EventStatus = 'draft' | 'live' | 'closed'

export interface ContestEvent {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly prize: string
  readonly status: EventStatus
  readonly startsAt: Date | null
  readonly endsAt: Date | null
  /** Sección de juego libre: sin código y sin límite de intentos. */
  readonly isFreePlay: boolean
}

/** Un concurso acepta jugadas solo si está publicado y dentro de su ventana. */
export function isOpen(event: ContestEvent, now: Date = new Date()): boolean {
  if (event.status !== 'live') return false
  if (event.startsAt && event.startsAt > now) return false
  if (event.endsAt && event.endsAt <= now) return false
  return true
}

export function isUpcoming(event: ContestEvent, now: Date = new Date()): boolean {
  return event.status === 'live' && !!event.startsAt && event.startsAt > now
}

export function hasEnded(event: ContestEvent, now: Date = new Date()): boolean {
  return event.status === 'closed' || (!!event.endsAt && event.endsAt <= now)
}
