import { hasEnded, isOpen, isUpcoming, type ContestEvent } from '../../domain/event/Event'

export function EventStatusBadge({ event }: { event: ContestEvent }) {
  if (isOpen(event)) return <span className="badge badge--live">● En vivo</span>
  if (isUpcoming(event)) return <span className="badge badge--soon">Próximamente</span>
  if (hasEnded(event)) return <span className="badge badge--closed">Finalizado</span>
  return <span className="badge">Borrador</span>
}

export function formatDate(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
