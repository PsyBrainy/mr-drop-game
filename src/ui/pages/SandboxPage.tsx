import { useCallback, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { GameStatus } from '../../games/GameModule'
import { GameCanvas } from '../components/GameCanvas'
import { GameHud } from '../components/GameHud'
import { GameStage, type GameStageRef } from '../components/GameStage'
import { gameAspectRatio, implementedSlugs } from '../../games/registry'
import { shareScore } from '../lib/shareScore'

const EMPTY_CONFIG = Object.freeze({})
const NO_STATUS: GameStatus = {}

/**
 * Banco de pruebas de desarrollo: monta cualquier juego del registry sin
 * necesidad de Supabase, evento ni código. Solo existe en `npm run dev`.
 */
export function SandboxPage() {
  const slugs = implementedSlugs()
  // `/sandbox?juego=<slug>` entra directo a un juego. Probar algo puntual es lo
  // que más se hace acá, y así el link se puede guardar o pasar.
  const [params, setParams] = useSearchParams()
  const asked = params.get('juego') ?? ''
  const [slug, setSlug] = useState(slugs.includes(asked) ? asked : (slugs[0] ?? ''))
  const [runId, setRunId] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<GameStatus>(NO_STATUS)
  const [result, setResult] = useState<{
    score: number
    message: string
    payload: string
    rawPayload: Record<string, unknown>
  } | null>(null)
  const stageRef = useRef<GameStageRef>(null)

  const play = useCallback(() => {
    setScore(0)
    setStatus(NO_STATUS)
    setResult(null)
    setPlaying(true)
    setRunId((n) => n + 1)
    void stageRef.current?.enter()
  }, [])

  const handleGameOver = useCallback((final: number, payload?: Record<string, unknown>) => {
    const message = payload?.['message']
    setResult({
      score: final,
      message: typeof message === 'string' ? message : '¡Terminó!',
      payload: JSON.stringify(payload ?? {}),
      rawPayload: payload ?? {},
    })
    setPlaying(false)
  }, [])

  const handleShare = () => {
    if (!result) return
    void shareScore({
      score: result.score,
      message: result.message,
      payload: result.rawPayload,
      modeLabel: `Modo: ${slug}`,
      shareUrl: window.location.href,
    })
  }

  return (
    <div className="container stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Sandbox de juegos</h1>
        <span className="badge badge--soon">modo prueba</span>
      </div>
      <p className="muted">
        Juego libre para probar: sin código de acceso y sin gastar intentos.
        <strong> El puntaje no se guarda ni entra en el ranking.</strong>
      </p>

      <div className="row">
        <select
          className="select"
          style={{ width: 'auto' }}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value)
            setParams(e.target.value ? { juego: e.target.value } : {}, { replace: true })
            setPlaying(false)
            setResult(null)
          }}
        >
          {slugs.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <button className="btn" onClick={play}>
          {runId === 0 ? 'Montar juego' : 'Reiniciar'}
        </button>
        <span className="spacer" />
        <Link to="/" className="muted">← Inicio</Link>
      </div>

      <div className="play-stage">
        <GameStage ref={stageRef} aspectRatio={gameAspectRatio(slug)}>
          {playing && slug && (
            <GameCanvas
              key={`${slug}-${runId}`}
              gameSlug={slug}
              config={EMPTY_CONFIG}
              onScoreChange={setScore}
              onStatusChange={setStatus}
              onGameOver={handleGameOver}
            />
          )}

          {playing && <GameHud score={score} status={status} />}

          {!playing && !result && (
            <div className="game-overlay">
              <div className="stack">
                <p className="muted">Elegí un juego y dale a montar.</p>
                <button className="btn" onClick={play}>Montar juego</button>
              </div>
            </div>
          )}

          {/* El botón va adentro del marco: en pantalla completa el de arriba
              queda tapado y no había forma de volver a empezar. */}
          {!playing && result && (
            <div className="game-overlay">
              <div className="stack">
                <h2 className="game-over__title">{result.message}</h2>
                <p className="game-over__score">{result.score}</p>
                <button className="btn" onClick={play}>Volver a empezar</button>
                <button className="btn btn--ghost" onClick={handleShare}>
                  Compartir en WhatsApp
                </button>
              </div>
            </div>
          )}
        </GameStage>
      </div>
    </div>
  )
}
