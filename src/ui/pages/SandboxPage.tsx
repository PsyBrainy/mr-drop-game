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
  const [result, setResult] = useState<{
    score: number
    message: string
    payload: string
    rawPayload: Record<string, unknown>
  } | null>(null)

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
      rawPayload: payload ?? {},
    })
    setPlaying(false)
  }, [])

  const handleShare = async () => {
    if (!result) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 800
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.fillStyle = '#1e1e2e'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.textAlign = 'center'

      ctx.font = 'bold 50px sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('¡Resultados en MrDrop!', 400, 120)

      ctx.font = 'bold 160px sans-serif'
      ctx.fillStyle = '#f9ca24'
      ctx.fillText(result.score.toString(), 400, 320)

      ctx.font = '36px sans-serif'
      ctx.fillStyle = '#ffffff'
      let y = 440

      if (result.rawPayload.obstaculos !== undefined) {
        ctx.fillText(`🚦 Obstáculos pasados: ${result.rawPayload.obstaculos}`, 400, y)
        y += 60
      }
      if (result.rawPayload.cogollos !== undefined) {
        ctx.fillText(`🌿 Cogollos fumados: ${result.rawPayload.cogollos}`, 400, y)
        y += 60
      }

      ctx.font = '30px sans-serif'
      ctx.fillStyle = '#ff7979'
      ctx.fillText(`💀 Razón: ${result.message}`, 400, y + 40)

      ctx.font = '24px sans-serif'
      ctx.fillStyle = '#888888'
      ctx.fillText(`Modo: ${slug} | mrdrop.com`, 400, 740)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return

      const file = new File([blob], 'puntaje.png', { type: 'image/png' })
      const shareText = `¡Acabo de hacer ${result.score} puntos en MrDrop!\n¿Te animás a superarme? Jugalo acá: ${window.location.href}`

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'MrDrop - Puntaje',
          text: shareText,
          files: [file],
        })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'puntaje-mrdrop.png'
        a.click()
        URL.revokeObjectURL(url)
        alert('Tu navegador descargó la imagen porque no soporta compartirla directamente. ¡Adjuntala en WhatsApp!')
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank')
      }
    } catch (err) {
      console.error('Error al compartir:', err)
      alert('Hubo un error al intentar compartir.')
    }
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
