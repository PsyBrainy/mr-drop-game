import { useCallback, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { GameStatus } from '../../games/GameModule'
import { useAuth } from '../providers/AuthProvider'
import { useRepositories, useUseCases } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import { useAction } from '../hooks/useAction'
import { GameCanvas } from '../components/GameCanvas'
import { GameHud } from '../components/GameHud'
import { GameStage, type GameStageRef } from '../components/GameStage'
import { Leaderboard } from '../components/Leaderboard'
import { PageSpinner } from '../components/ProtectedRoute'
import { gameAspectRatio } from '../../games/registry'
import { shareScore } from '../lib/shareScore'

type Phase = 'ready' | 'playing' | 'finished'

const NO_STATUS: GameStatus = {}

export function PlayPage() {
  const { slug = '', gameSlug = '' } = useParams<{ slug: string; gameSlug: string }>()
  const { userId } = useAuth()
  const { events } = useRepositories()
  const { prepareGameEntry, startGameSession, finishGameSession, getLeaderboard } = useUseCases()

  const [phase, setPhase] = useState<Phase>('ready')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [liveScore, setLiveScore] = useState(0)
  const [status, setStatus] = useState<GameStatus>(NO_STATUS)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [endMessage, setEndMessage] = useState<string | null>(null)
  const [endPayload, setEndPayload] = useState<Record<string, unknown>>({})
  const stageRef = useRef<GameStageRef>(null)
  const [isImmersive, setIsImmersive] = useState(false)

  const event = useAsync(() => events.findBySlug(slug), [slug, events])
  const contest = event.data

  const entry = useAsync(
    () => prepareGameEntry.execute(contest!, gameSlug),
    [contest, gameSlug, prepareGameEntry],
    { enabled: Boolean(contest) },
  )

  const eventGameId = entry.data?.eventGame.id
  const ranking = useAsync(
    () => getLeaderboard.forGame(eventGameId ?? '', userId, 10),
    [eventGameId, userId, phase, getLeaderboard],
    { enabled: Boolean(eventGameId) },
  )

  const start = useAction(async () => {
    if (!eventGameId) return
    const session = await startGameSession.execute(eventGameId)
    setSessionId(session.id)
    setLiveScore(0)
    setStatus(NO_STATUS)
    setFinalScore(null)
    setEndMessage(null)
    setEndPayload({})
    setPhase('playing')
    void stageRef.current?.enter()
  })

  const submit = useAction(async (score: number, payload?: Record<string, unknown>) => {
    if (!sessionId) return
    const session = await finishGameSession.execute(sessionId, score, payload)
    setFinalScore(session.score)
    setPhase('finished')
    entry.reload()
    ranking.reload()
  })

  const handleGameOver = useCallback(
    (score: number, payload?: Record<string, unknown>) => {
      const message = payload?.['message']
      setEndMessage(typeof message === 'string' ? message : null)
      setEndPayload(payload ?? {})
      void submit.run(score, payload)
    },
    [submit],
  )

  // Mostrar spinner de página solo en la primera carga, no en reloads.
  if ((event.loading && !event.data) || (entry.loading && !entry.data)) {
    return <PageSpinner />
  }

  if (entry.error || !entry.data || !event.data) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>No podés jugar este juego ahora</h2>
          <p className="muted">{entry.error ?? event.error ?? 'El juego no está disponible.'}</p>
          <Link to={event.data?.isFreePlay ? '/jugar' : `/concurso/${slug}`} className="btn btn--ghost btn--sm">
            {event.data?.isFreePlay ? 'Volver a juego libre' : 'Volver al concurso'}
          </Link>
        </div>
      </div>
    )
  }

  const { eventGame, playsLeft, bestScore } = entry.data
  const canPlay = playsLeft === null || playsLeft > 0
  const backTo = event.data.isFreePlay ? '/jugar' : `/concurso/${slug}`

  const share = () =>
    void shareScore({
      score: finalScore ?? 0,
      message: endMessage ?? '¡Terminó!',
      payload: endPayload,
      modeLabel: eventGame.game.name,
      shareUrl: `${window.location.origin}${backTo}`,
    })

  return (
    <div className="container stack">
      <div className="row">
        <Link to={backTo} className="muted">← {event.data.name}</Link>
        <span className="spacer" />
        {playsLeft === null ? (
          <span className="badge badge--live">Intentos ilimitados</span>
        ) : (
          <span className="badge">{playsLeft} {playsLeft === 1 ? 'intento' : 'intentos'} restantes</span>
        )}
      </div>

      <h1 style={{ marginBottom: 0 }}>{eventGame.game.name}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{eventGame.game.description}</p>

      {(start.error || submit.error) && (
        <div className="alert alert--error">{start.error ?? submit.error}</div>
      )}

      <div className="play-stage">
        {/* Todo lo que el jugador necesita va adentro del marco: en pantalla
            completa no se ve nada de la página que está atrás. */}
        <GameStage 
          ref={stageRef} 
          aspectRatio={gameAspectRatio(gameSlug)}
          onImmersiveChange={setIsImmersive}
        >
          {phase === 'playing' && sessionId && (
            <GameCanvas
              gameSlug={eventGame.game.slug}
              config={eventGame.config}
              onScoreChange={setLiveScore}
              onStatusChange={setStatus}
              onGameOver={handleGameOver}
            />
          )}

          {phase === 'playing' && (
            <GameHud score={liveScore} best={bestScore} status={status} />
          )}

          {phase === 'ready' && !isImmersive && (
            <div className="game-overlay">
              <div className="stack">
                <h2 style={{ marginBottom: 0 }}>Modo inmersivo</h2>
                <p className="muted">Preparate para jugar a pantalla completa.</p>
                {canPlay ? (
                  <button className="btn" onClick={() => void stageRef.current?.enter()}>
                    Ingresar al juego
                  </button>
                ) : (
                  <p className="alert alert--warn">Ya usaste todos tus intentos en este juego.</p>
                )}
              </div>
            </div>
          )}

          {phase === 'ready' && isImmersive && (
            <div className="game-overlay">
              <div className="stack">
                <h2 style={{ marginBottom: 0 }}>¿Listo?</h2>
                <p className="muted">{eventGame.game.description}</p>
                {canPlay ? (
                  <button className="btn" onClick={() => void start.run()} disabled={start.pending}>
                    {start.pending ? 'Preparando…' : 'Comenzar'}
                  </button>
                ) : (
                  <p className="alert alert--warn">Ya usaste todos tus intentos en este juego.</p>
                )}
              </div>
            </div>
          )}

          {phase === 'finished' && (
            <div className="game-overlay">
              <div className="stack">
                <h2 className="game-over__title">{endMessage ?? '¡Terminó!'}</h2>
                <p className="game-over__score">{finalScore ?? 0}</p>
                <p className="muted">
                  {submit.pending ? 'Guardando tu puntaje…' : 'Tu puntaje ya está en el ranking.'}
                </p>
                <div className="row" style={{ justifyContent: 'center' }}>
                  {canPlay && (
                    <button className="btn" onClick={() => void start.run()} disabled={start.pending}>
                      Volver a empezar
                    </button>
                  )}
                  {event.data.isFreePlay && (
                    <button className="btn btn--ghost" onClick={share} disabled={submit.pending}>
                      Compartir en WhatsApp
                    </button>
                  )}
                  <Link to={backTo} className="btn btn--ghost">Salir</Link>
                </div>
              </div>
            </div>
          )}
        </GameStage>
      </div>

      <section className="stack">
        <h2>Ranking de {eventGame.game.name}</h2>
        <div className="card">
          {ranking.loading ? (
            <div className="skeleton" style={{ height: '5rem' }} />
          ) : (
            <Leaderboard entries={ranking.data?.entries ?? []} currentUserId={userId} />
          )}
        </div>
      </section>
    </div>
  )
}
