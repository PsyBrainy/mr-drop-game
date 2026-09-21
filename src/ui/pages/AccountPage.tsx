import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { useContainer, useRepositories } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import { useAction } from '../hooks/useAction'
import { EventStatusBadge } from '../components/EventStatusBadge'
import { AddressPicker } from '../components/AddressPicker'

export function AccountPage() {
  const { profile, refresh, signOut } = useAuth()
  const { auth } = useContainer()
  const { events, participations } = useRepositories()
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [saved, setSaved] = useState(false)

  const mine = useAsync(async () => {
    const [ids, all] = await Promise.all([participations.listMyEventIds(), events.listPublic()])
    return all.filter((event) => ids.includes(event.id))
  }, [events, participations])

  const save = useAction(async () => {
    await auth.updateDisplayName(displayName)
    await refresh()
    setSaved(true)
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    void save.run()
  }

  return (
    <div className="container stack">
      <h1>Mi cuenta</h1>

      <div className="card stack">
        <h2 style={{ fontSize: '1.2rem' }}>Perfil</h2>
        {save.error && <div className="alert alert--error">{save.error}</div>}
        {saved && <div className="alert alert--ok">Nombre actualizado.</div>}
        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Nombre en el ranking</span>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <div className="row">
            <button type="submit" className="btn" disabled={save.pending}>
              {save.pending ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void signOut()}>
              Cerrar sesión
            </button>
          </div>
        </form>
      </div>

      <AddressPicker />

      <section className="stack">
        <h2 style={{ fontSize: '1.2rem' }}>Mis concursos</h2>
        {mine.loading && <div className="skeleton" style={{ height: '4rem' }} />}
        {!mine.loading && (mine.data?.length ?? 0) === 0 && (
          <div className="empty-state">
            Todavía no entraste a ningún concurso. <Link to="/codigo">Canjeá tu código</Link>.
          </div>
        )}
        <div className="grid grid--2">
          {(mine.data ?? []).map((event) => (
            <Link key={event.id} to={`/concurso/${event.slug}`} className="card event-card">
              <EventStatusBadge event={event} />
              <h3 style={{ margin: 0 }}>{event.name}</h3>
              {event.prize && <span className="event-card__prize">🏆 {event.prize}</span>}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
