import { useEffect, useState } from 'react'
import type { ContestEvent, EventStatus } from '../../domain/event/Event'
import { useRepositories, useUseCases } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import { useAction } from '../hooks/useAction'
import { EventStatusBadge } from '../components/EventStatusBadge'
import { isGameImplemented } from '../../games/registry'
import { AccessCodePanel } from './admin/AccessCodePanel'
import { EventForm } from './admin/EventForm'

export function AdminPage() {
  const { events } = useRepositories()
  const eventList = useAsync(() => events.listAll(), [events])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const list = eventList.data ?? []
  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId(list[0]!.id)
  }, [list, selectedId])

  const selected = list.find((event) => event.id === selectedId) ?? null

  return (
    <div className="container stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Panel Mister Drop</h1>
        <span className="spacer" />
        <button className="btn btn--sm" onClick={() => setCreating((value) => !value)}>
          {creating ? 'Cancelar' : '+ Nuevo concurso'}
        </button>
      </div>

      {creating && (
        <EventForm
          onCreated={() => {
            setCreating(false)
            eventList.reload()
          }}
        />
      )}

      {eventList.error && <div className="alert alert--error">{eventList.error}</div>}

      <div className="admin-layout">
        <aside className="card">
          <h2 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.07em' }} className="muted">
            Concursos
          </h2>
          <div className="admin-list">
            {list.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`admin-list__item ${event.id === selectedId ? 'is-active' : ''}`}
                onClick={() => setSelectedId(event.id)}
              >
                {event.name}
                <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>{event.status}</div>
              </button>
            ))}
            {list.length === 0 && !eventList.loading && (
              <p className="muted" style={{ fontSize: '0.9rem' }}>Creá tu primer concurso.</p>
            )}
          </div>
        </aside>

        <div className="stack">
          {selected ? (
            <EventAdmin key={selected.id} event={selected} onChanged={() => eventList.reload()} />
          ) : (
            <div className="empty-state">Elegí un concurso de la izquierda.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function EventAdmin({ event, onChanged }: { event: ContestEvent; onChanged: () => void }) {
  const { events } = useRepositories()
  const joinLink = `${window.location.origin}/codigo`

  const setStatus = useAction(async (status: EventStatus) => {
    await events.update(event.id, { status })
    onChanged()
  })

  return (
    <>
      <section className="card stack">
        <div className="row">
          <EventStatusBadge event={event} />
          <span className="spacer" />
          <span className="muted" style={{ fontSize: '0.85rem' }}>/{event.slug}</span>
        </div>
        <h2 style={{ margin: 0 }}>{event.name}</h2>
        {event.prize && <p className="event-card__prize" style={{ margin: 0 }}>🏆 {event.prize}</p>}

        {setStatus.error && <div className="alert alert--error">{setStatus.error}</div>}

        <div className="row">
          <span className="muted" style={{ fontSize: '0.85rem' }}>Estado:</span>
          {(['draft', 'live', 'closed'] as const).map((status) => (
            <button
              key={status}
              className={`btn btn--sm ${event.status === status ? '' : 'btn--ghost'}`}
              disabled={setStatus.pending || event.status === status}
              onClick={() => void setStatus.run(status)}
            >
              {status === 'draft' ? 'Borrador' : status === 'live' ? 'En vivo' : 'Cerrado'}
            </button>
          ))}
        </div>

        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          Link para repartir: <span className="code-pill">{joinLink}/TUCODIGO</span>
        </p>
      </section>

      <GameAvailabilityPanel eventId={event.id} />
      <AccessCodePanel eventId={event.id} />
    </>
  )
}

/** El control central: qué juegos están disponibles en este evento. */
function GameAvailabilityPanel({ eventId }: { eventId: string }) {
  const { games } = useRepositories()
  const { manageEventGames } = useUseCases()

  const catalog = useAsync(() => games.listCatalog(), [games])
  const assigned = useAsync(() => manageEventGames.listForEvent(eventId), [eventId, manageEventGames])

  const toggle = useAction(async (gameId: string, enabled: boolean) => {
    const existing = (assigned.data ?? []).find((item) => item.game.id === gameId)
    if (existing) {
      await manageEventGames.toggle(existing.id, enabled)
    } else {
      const created = await manageEventGames.addToEvent(eventId, gameId, assigned.data?.length ?? 0)
      if (enabled) await manageEventGames.toggle(created.id, true)
    }
    assigned.reload()
  })

  return (
    <section className="card stack">
      <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Disponibilidad de juegos</h2>
      <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
        Prendé los juegos que quieras habilitar para este concurso. El cambio es inmediato
        para los jugadores.
      </p>

      {(catalog.error || assigned.error || toggle.error) && (
        <div className="alert alert--error">{catalog.error ?? assigned.error ?? toggle.error}</div>
      )}

      {catalog.loading || assigned.loading ? (
        <div className="skeleton" style={{ height: '5rem' }} />
      ) : (catalog.data ?? []).length === 0 ? (
        <div className="empty-state">
          No hay juegos en el catálogo. Insertá filas en la tabla <code>games</code> con el
          mismo slug que el módulo del front.
        </div>
      ) : (
        <div>
          {(catalog.data ?? []).map((game) => {
            const current = (assigned.data ?? []).find((item) => item.game.id === game.id)
            const enabled = current?.isEnabled ?? false
            return (
              <div key={game.id} className="toggle-row">
                <div className="toggle-row__info">
                  <div className="toggle-row__name">
                    {game.name}{' '}
                    {!isGameImplemented(game.slug) && (
                      <span className="badge badge--soon">sin módulo</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {game.description || game.slug}
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={toggle.pending}
                    onChange={(e) => void toggle.run(game.id, e.target.checked)}
                    aria-label={`Habilitar ${game.name}`}
                  />
                  <span className="switch__track" />
                </label>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
