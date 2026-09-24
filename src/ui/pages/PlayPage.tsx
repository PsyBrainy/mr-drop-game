import { useCallback, useMemo, useRef, useState } from 'react'
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
import { gameAspectRatio, gameHasOwnHud, gameKind } from '../../games/registry'
import { shareScore } from '../lib/shareScore'
import { BotLevelPicker } from '../components/BotLevelPicker'
import { FightRanking } from '../components/FightRanking'
import { botLevelOf, type BotLevel } from '../../fight/bot/levels'

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
  // Pelea: contra quién va la próxima. `null` es buscar una persona; un nivel
  // es directo contra la máquina, sin pasar por la cola.
  const [vsBot, setVsBot] = useState<BotLevel | null>(null)
  const [botLevel, setBotLevel] = useState<BotLevel>('easy')

  // Una pelea 1v1 no abre sesión, no gasta intentos ni guarda puntaje: el
  // resultado lo archiva psy-ws. Ver `GameKind` en el registry.
  const isMatch = gameKind(gameSlug) === 'match'

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
    { enabled: Boolean(eventGameId) && !isMatch },
  )

  const baseConfig = entry.data?.eventGame.config
  // Memorizada: si cambiara en cada render, el juego se volvería a montar.
  // La pelea además necesita saber desde qué concurso se entra: el servidor
  // empareja sólo con gente del mismo, y el resultado va a su ranking.
  const config = useMemo(() => {
    const base = baseConfig ?? {}
    if (!isMatch) return base
    return vsBot ? { ...base, vsBot } : { ...base, eventGameId }
  }, [baseConfig, vsBot, isMatch, eventGameId])

  const start = useAction(async (opponent: BotLevel | null = null) => {
    if (!eventGameId) return
    setVsBot(isMatch ? opponent : null)
    if (opponent) setBotLevel(opponent)
    if (isMatch) {
      // Sin sesión: la pelea se identifica ante psy-ws con el token del usuario.
      setSessionId(null)
    } else {
      const session = await startGameSession.execute(eventGameId)
      setSessionId(session.id)
    }
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
      if (isMatch) {
        // No hay puntaje que guardar: el cartel es el resultado.
        setPhase('finished')
        return
      }
      void submit.run(score, payload)
    },
    [submit, isMatch],
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
  const canPlay = isMatch || playsLeft === null || playsLeft > 0
  const backTo = event.data.isFreePlay ? '/jugar' : `/concurso/${slug}`

  // Si la última fue contra la máquina (elegida antes o aceptada en la cola), a
  // qué nivel: para ofrecer la revancha.
  const lastBot = isMatch ? botLevelOf(endPayload['vsBot']) : null

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
        {isMatch ? (
          <span className="badge badge--live">1v1 online</span>
        ) : playsLeft === null ? (
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
          {phase === 'playing' && (sessionId || isMatch) && (
            <GameCanvas
              gameSlug={eventGame.game.slug}
              config={config}
              onScoreChange={setLiveScore}
              onStatusChange={setStatus}
              onGameOver={handleGameOver}
            />
          )}

          {phase === 'playing' && !gameHasOwnHud(gameSlug) && (
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
                  <button className="btn" onClick={() => void start.run(null)} disabled={start.pending}>
                    {start.pending ? 'Preparando…' : isMatch ? 'Buscar rival' : 'Comenzar'}
                  </button>
                ) : (
                  <p className="alert alert--warn">Ya usaste todos tus intentos en este juego.</p>
                )}
                {isMatch && (
                  <div className="play-bot">
                    <p className="play-bot__label muted">o jugá contra la máquina</p>
                    <BotLevelPicker value={botLevel} onChange={setBotLevel} />
                    <button
                      className="btn btn--ghost"
                      onClick={() => void start.run(botLevel)}
                      disabled={start.pending}
                    >
                      Jugar contra la máquina
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === 'finished' && (
            <div className="game-overlay">
              <div className="stack">
                <h2 className="game-over__title">{endMessage ?? '¡Terminó!'}</h2>
                {isMatch ? (
                  <p className="muted">
                    {lastBot
                      ? 'Contra la máquina no suma al ranking.'
                      : 'El resultado aparece en el ranking en un minuto, cuando se confirma.'}
                  </p>
                ) : (
                  <>
                    <p className="game-over__score">{finalScore ?? 0}</p>
                    <p className="muted">
                      {submit.pending ? 'Guardando tu puntaje…' : 'Tu puntaje ya está en el ranking.'}
                    </p>
                  </>
                )}
                <div className="row" style={{ justifyContent: 'center' }}>
                  {canPlay && lastBot && (
                    <button className="btn" onClick={() => void start.run(lastBot)} disabled={start.pending}>
                      Revancha
                    </button>
                  )}
                  {canPlay && (
                    <button
                      className={lastBot ? 'btn btn--ghost' : 'btn'}
                      onClick={() => void start.run(null)}
                      disabled={start.pending}
                    >
                      {isMatch ? (lastBot ? 'Buscar rival' : 'Buscar otra pelea') : 'Volver a empezar'}
                    </button>
                  )}
                  {canPlay && isMatch && !lastBot && (
                    <button className="btn btn--ghost" onClick={() => void start.run(botLevel)} disabled={start.pending}>
                      Contra la máquina
                    </button>
                  )}
                  {event.data.isFreePlay && !isMatch && (
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

      {isMatch && (
        <section className="stack">
          <h2>Ranking de {eventGame.game.name}</h2>
          <div className="card">
            <FightRanking eventGameId={eventGame.id} currentUserId={userId} refreshKey={phase} />
          </div>
        </section>
      )}

      {!isMatch && (
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
      )}
    </div>
  )
}
