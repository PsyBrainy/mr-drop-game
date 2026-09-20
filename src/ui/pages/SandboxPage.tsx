import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameStatus } from '../../games/GameModule'
import { GameCanvas } from '../components/GameCanvas'
import { GameHud } from '../components/GameHud'
import { GameStage } from '../components/GameStage'
import { gameAspectRatio, implementedSlugs } from '../../games/registry'

const EMPTY_CONFIG = Object.freeze({})
const NO_STATUS: GameStatus = {}

/**
 * Banco de pruebas de desarrollo: monta cualquier juego del registry sin
 * necesidad de Supabase, evento ni código. Solo existe en `npm run dev`.
 */
export function SandboxPage() {
  const slugs = implementedSlugs()
  const [slug, setSlug] = useState(slugs[0] ?? '')
  const [runId, setRunId] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<GameStatus>(NO_STATUS)
  const [result, setResult] = useState<{ score: number; message: string; payload: string } | null>(
    null,
  )

  const play = useCallback(() => {
    setScore(0)
    setStatus(NO_STATUS)
    setResult(null)
    setPlaying(true)
    setRunId((n) => n + 1)
  }, [])

  const handleGameOver = useCallback((final: number, payload?: Record<string, unknown>) => {
    const message = payload?.['message']
    setResult({
      score: final,
      message: typeof message === 'string' ? message : '¡Terminó!',
      payload: JSON.stringify(payload ?? {}),
    })
    setPlaying(false)
  }, [])

  return (
    <div className="container stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Sandbox de juegos</h1>
        <span className="badge badge--soon">solo dev</span>
      </div>
      <p className="muted">
        Probá los módulos de <code>src/games/modules</code> sin backend. El puntaje no se guarda.
      </p>

      <div className="row">
        <select
          className="select"
          style={{ width: 'auto' }}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value)
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
        <GameStage aspectRatio={gameAspectRatio(slug)}>
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
                <p className="muted" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
                  {result.payload}
                </p>
              </div>
            </div>
          )}
        </GameStage>
      </div>
    </div>
  )
}
