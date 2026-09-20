import { useEffect, useRef, useState } from 'react'
import type { GameHandle, GameStatus } from '../../games/GameModule'
import { loadGameModule } from '../../games/registry'
import { errorMessage } from '../hooks/useAsync'

interface Props {
  gameSlug: string
  config: Readonly<Record<string, unknown>>
  onScoreChange: (score: number) => void
  onStatusChange: (status: GameStatus) => void
  onGameOver: (score: number, payload?: Record<string, unknown>) => void
}

/**
 * Puente React <-> motor de juego. El módulo se carga bajo demanda y se
 * desmonta siempre: un canvas huérfano seguiría corriendo el loop de Kaplay.
 */
export function GameCanvas({
  gameSlug,
  config,
  onScoreChange,
  onStatusChange,
  onGameOver,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  // Los callbacks se leen por ref para no re-montar el juego en cada render.
  const scoreRef = useRef(onScoreChange)
  const statusRef = useRef(onStatusChange)
  const overRef = useRef(onGameOver)
  scoreRef.current = onScoreChange
  statusRef.current = onStatusChange
  overRef.current = onGameOver

  useEffect(() => {
    const mountPoint = mountRef.current
    if (!mountPoint) return

    let handle: GameHandle | null = null
    let cancelled = false

    void loadGameModule(gameSlug)
      .then((module) => {
        if (cancelled) return
        return module.mount({
          mountPoint,
          config,
          onScoreChange: (score) => scoreRef.current(score),
          onStatusChange: (status) => statusRef.current(status),
          onGameOver: (score, payload) => overRef.current(score, payload),
        })
      })
      .then((mounted) => {
        if (!mounted) return
        if (cancelled) {
          mounted.destroy()
          return
        }
        handle = mounted
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause))
      })

    return () => {
      cancelled = true
      handle?.destroy()
    }
  }, [gameSlug, config])

  if (error) {
    return <div className="game-overlay"><p className="alert alert--error">{error}</p></div>
  }

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
