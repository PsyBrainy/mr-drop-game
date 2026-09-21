import { Link } from 'react-router-dom'
import { useRepositories } from '../providers/ContainerProvider'
import { isSupabaseConfigured } from '../../infrastructure/supabase/client'
import { useAsync } from '../hooks/useAsync'
import { EventStatusBadge, formatDate } from '../components/EventStatusBadge'
import { isOpen } from '../../domain/event/Event'

export function HomePage() {
  const { events } = useRepositories()
  const { data, loading } = useAsync(() => events.listPublic(), [events], {
    enabled: isSupabaseConfigured,
  })

  const list = data ?? []
  const live = list.filter((event) => isOpen(event))

  return (
    <>
      <section className="container hero">
        <span className="hero__eyebrow">Comunidad Mister Drop</span>
        <h1>Jugá, sumá puntos<br />y llevate premios.</h1>
        <p className="hero__lead">
          Concursos para la comunidad. Te llega un link con tu código, entrás, jugás los juegos
          habilitados para ese evento y quedás en el ranking. El que más puntos hace, gana.
        </p>
        <div className="hero__actions">
          <Link to="/jugar" className="btn">Jugar ahora</Link>
          <Link to="/codigo" className="btn btn--ghost">Tengo un código</Link>
        </div>
      </section>

      <section className="container stack" style={{ marginBottom: '3rem' }}>
        <div className="card row">
          <div style={{ flex: 1, minWidth: '220px' }}>
            <strong>Juego libre</strong>
            <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
              Sin código y sin límite de intentos. Superá tu récord y subí en el ranking general.
            </p>
          </div>
          <Link to="/jugar" className="btn btn--ghost btn--sm">Ver juegos</Link>
        </div>
      </section>

      <section className="container stack" style={{ marginBottom: '3rem' }}>
        <h2>Cómo funciona</h2>
        <div className="grid grid--3">
          <Step n={1} title="Conseguí tu código">
            Los códigos se reparten en los eventos y en los canales de la comunidad. Cada código
            habilita un concurso puntual.
          </Step>
          <Step n={2} title="Entrá y jugá">
            Creás tu cuenta, canjeás el código y se te abren los juegos que estén habilitados para
            ese concurso.
          </Step>
          <Step n={3} title="Subí en el ranking">
            Tu mejor puntaje queda en la tabla en vivo. Al cerrar el concurso, los primeros se
            llevan los premios.
          </Step>
        </div>
      </section>

      <section className="container stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>Concursos</h2>
          <span className="spacer" />
          {live.length > 0 && <span className="badge badge--live">{live.length} en vivo</span>}
        </div>

        {loading && <div className="skeleton" style={{ height: '7rem' }} />}

        {!loading && list.length === 0 && (
          <div className="empty-state">
            <h3>No hay concursos publicados todavía</h3>
            <p className="muted">Seguinos en la comunidad para enterarte del próximo.</p>
          </div>
        )}

        <div className="grid grid--2">
          {list.map((event) => (
            <article key={event.id} className="card event-card">
              <div className="row">
                <EventStatusBadge event={event} />
                <span className="spacer" />
                <span className="muted" style={{ fontSize: '0.85rem' }}>{formatDate(event.startsAt)}</span>
              </div>
              <h3 style={{ margin: 0 }}>{event.name}</h3>
              {event.description && <p className="muted" style={{ margin: 0 }}>{event.description}</p>}
              {event.prize && <p className="event-card__prize">🏆 {event.prize}</p>}
              <div className="row">
                <Link to={`/concurso/${event.slug}`} className="btn btn--ghost btn--sm">
                  Ver concurso
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <div className="step__n">{n}</div>
      <h3>{title}</h3>
      <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>{children}</p>
    </div>
  )
}
