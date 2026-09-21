import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { useUseCases } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import { EventStatusBadge, formatDate } from '../components/EventStatusBadge'
import { Leaderboard } from '../components/Leaderboard'
import { PageSpinner } from '../components/ProtectedRoute'
import { isGameImplemented } from '../../games/registry'

export function EventPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const location = useLocation()
  const { isAuthenticated, userId, loading: authLoading } = useAuth()
  const { loadEventBoard, getLeaderboard } = useUseCases()

  const board = useAsync(
    () => loadEventBoard.execute(slug, { authenticated: isAuthenticated }),
    [slug, isAuthenticated, loadEventBoard],
    { enabled: !authLoading },
  )

  const eventId = board.data?.event.id
  const ranking = useAsync(
    () => getLeaderboard.forEvent(eventId ?? '', userId, 20),
    [eventId, userId, getLeaderboard],
    { enabled: Boolean(eventId) },
  )

  if (board.loading || authLoading) return <PageSpinner />
  if (board.error || !board.data) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>No encontramos ese concurso</h2>
          <p className="muted">{board.error ?? 'Puede que todavía no esté publicado.'}</p>
          <Link to="/" className="btn btn--ghost btn--sm">Volver al inicio</Link>
        </div>
      </div>
    )
  }

  const { event, games, isParticipant, isOpen } = board.data
  if (event.isFreePlay) return <Navigate to="/jugar" replace />
  const justJoined = (location.state as { joined?: boolean } | null)?.joined

  return (
    <div className="container stack">
      {justJoined && <div className="alert alert--ok">¡Listo! Ya estás participando de este concurso.</div>}

      <header className="stack">
        <div className="row">
          <EventStatusBadge event={event} />
          <span className="muted" style={{ fontSize: '0.88rem' }}>
            {formatDate(event.startsAt)} → {formatDate(event.endsAt)}
          </span>
        </div>
        <h1 style={{ marginBottom: 0 }}>{event.name}</h1>
        {event.description && <p className="hero__lead">{event.description}</p>}
        {event.prize && (
          <p className="event-card__prize" style={{ fontSize: '1.05rem' }}>🏆 {event.prize}</p>
        )}
      </header>

      {!isOpen && (
        <div className="alert alert--warn">
          Este concurso no está abierto ahora mismo. El ranking queda igual para consulta.
        </div>
      )}

      {isOpen && !isParticipant && (
        <div className="card row">
          <div style={{ flex: 1, minWidth: '220px' }}>
            <strong>Necesitás tu código para jugar</strong>
            <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
              Canjealo una vez y quedás habilitado para todos los juegos del concurso.
            </p>
          </div>
          <Link to="/codigo" className="btn">Ingresar código</Link>
        </div>
      )}

      <section className="stack">
        <h2>Juegos habilitados</h2>
        {games.length === 0 ? (
          <div className="empty-state">
            Todavía no hay juegos habilitados para este concurso. Volvé en un rato.
          </div>
        ) : (
          <div className="game-grid">
            {games.map((eventGame) => {
              const playable = isOpen && isParticipant && isGameImplemented(eventGame.game.slug)
              return (
                <article key={eventGame.id} className="card game-card">
                  <div className="game-card__cover">
                    {eventGame.game.coverUrl ? (
                      <img src={eventGame.game.coverUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">🎮</span>
                    )}
                  </div>
                  <h3 style={{ margin: 0 }}>{eventGame.game.name}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: '0.92rem', flex: 1 }}>
                    {eventGame.game.description}
                  </p>
                  <div className="row">
                    <span className="badge">
                      {eventGame.maxPlays} {eventGame.maxPlays === 1 ? 'intento' : 'intentos'}
                    </span>
                    <span className="spacer" />
                    {playable ? (
                      <Link to={`/concurso/${event.slug}/${eventGame.game.slug}`} className="btn btn--sm">
                        Jugar
                      </Link>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        {!isGameImplemented(eventGame.game.slug) ? 'Próximamente' : 'Requiere código'}
                      </span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Ranking general</h2>
        <div className="card">
          {ranking.loading ? (
            <div className="skeleton" style={{ height: '6rem' }} />
          ) : (
            <Leaderboard entries={ranking.data?.entries ?? []} currentUserId={userId} showGame />
          )}
        </div>
      </section>
    </div>
  )
}
