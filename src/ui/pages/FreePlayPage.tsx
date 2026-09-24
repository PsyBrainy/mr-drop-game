import { Link } from 'react-router-dom'
import type { GeneralRankingEntry } from '../../domain/leaderboard/GeneralRanking'
import { useAuth } from '../providers/AuthProvider'
import { useUseCases } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import { Avatar } from '../components/Avatar'
import { Leaderboard } from '../components/Leaderboard'
import { PageSpinner } from '../components/ProtectedRoute'
import { gameKind, isGameImplemented } from '../../games/registry'
import { GameCover } from '../components/GameCover'
import { FightRanking } from '../components/FightRanking'

/**
 * Sección de juego libre: sin código ni límite de intentos. Cada juego muestra
 * tu récord y su ranking; abajo, el ranking general (suma de récords).
 */
export function FreePlayPage() {
  const { isAuthenticated, userId, loading: authLoading } = useAuth()
  const { loadFreePlayBoard } = useUseCases()

  const board = useAsync(
    () => loadFreePlayBoard.execute({ authenticated: isAuthenticated }),
    [isAuthenticated, loadFreePlayBoard],
    { enabled: !authLoading },
  )

  if (board.loading || authLoading) return <PageSpinner />

  if (board.error) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>No pudimos cargar el juego libre</h2>
          <p className="muted">{board.error}</p>
          <Link to="/" className="btn btn--ghost btn--sm">Volver al inicio</Link>
        </div>
      </div>
    )
  }

  if (!board.data) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>El juego libre está cerrado por ahora</h2>
          <p className="muted">Volvé en un rato o mirá los concursos abiertos.</p>
          <Link to="/" className="btn btn--ghost btn--sm">Volver al inicio</Link>
        </div>
      </div>
    )
  }

  const { event, games, general } = board.data

  return (
    <div className="container stack">
      <header className="stack">
        <span className="badge badge--live">Sin código · intentos ilimitados</span>
        <h1 style={{ marginBottom: 0 }}>{event.name}</h1>
        {event.description && <p className="hero__lead">{event.description}</p>}
        {!isAuthenticated && (
          <div className="card row">
            <div style={{ flex: 1, minWidth: '220px' }}>
              <strong>Entrá con tu cuenta para jugar</strong>
              <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
                Así guardamos tu récord y aparecés en el ranking.
              </p>
            </div>
            <Link to="/entrar" state={{ from: '/jugar' }} className="btn">Ingresar</Link>
          </div>
        )}
      </header>

      <section className="stack">
        <h2>Juegos</h2>
        {games.length === 0 ? (
          <div className="empty-state">
            Todavía no hay juegos habilitados en juego libre. Volvé en un rato.
          </div>
        ) : (
          <div className="game-grid">
            {games.map(({ eventGame, myBest, ranking }) => {
              const implemented = isGameImplemented(eventGame.game.slug)
              // Las peleas no tienen puntaje: ni récord ni ranking de puntos.
              const isMatch = gameKind(eventGame.game.slug) === 'match'
              return (
                <article key={eventGame.id} className="card game-card">
                  <GameCover game={eventGame.game} />
                  <h3 style={{ margin: 0 }}>{eventGame.game.name}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
                    {eventGame.game.description}
                  </p>

                  <div className="row">
                    {isMatch && <span className="badge badge--live">1v1 online</span>}
                    {isAuthenticated && !isMatch && (
                      <span className="badge">
                        Tu récord: {myBest === null ? '—' : myBest.toLocaleString('es-AR')}
                      </span>
                    )}
                    <span className="spacer" />
                    {implemented && isAuthenticated ? (
                      <Link to={`/concurso/${event.slug}/${eventGame.game.slug}`} className="btn btn--sm">
                        Jugar
                      </Link>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        {implemented ? 'Requiere cuenta' : 'Próximamente'}
                      </span>
                    )}
                  </div>

                  <details className="game-card__ranking">
                    <summary className="muted" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
                      Ranking de {eventGame.game.name}
                    </summary>
                    <div style={{ marginTop: '0.6rem' }}>
                      {isMatch ? (
                        <FightRanking eventGameId={eventGame.id} currentUserId={userId} limit={5} />
                      ) : (
                        <Leaderboard entries={ranking} currentUserId={userId} />
                      )}
                    </div>
                  </details>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Ranking general</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          La suma del mejor puntaje de cada jugador en todos los juegos.
        </p>
        <div className="card">
          <GeneralRanking entries={general} currentUserId={userId} />
        </div>
      </section>
    </div>
  )
}

function GeneralRanking({
  entries,
  currentUserId,
}: {
  entries: readonly GeneralRankingEntry[]
  currentUserId: string | null
}) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        Todavía no jugó nadie. <strong>Podés ser el primero.</strong>
      </div>
    )
  }

  return (
    <table className="board">
      <thead>
        <tr>
          <th className="board__pos">#</th>
          <th>Jugador</th>
          <th>Juegos</th>
          <th style={{ textAlign: 'right' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => (
          <tr key={entry.userId} className={entry.userId === currentUserId ? 'is-me' : ''}>
            <td className="board__pos">{index + 1}</td>
            <td>
              <span className="board__player">
                <Avatar displayName={entry.displayName} avatarUrl={entry.avatarUrl} />
                {entry.displayName || 'Dropper'}
              </span>
            </td>
            <td className="muted">{entry.gamesPlayed}</td>
            <td className="board__score">{entry.totalScore.toLocaleString('es-AR')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
