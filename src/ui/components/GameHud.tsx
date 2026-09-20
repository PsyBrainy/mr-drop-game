import type { GameStatus } from '../../games/GameModule'

interface Props {
  score: number
  scoreLabel?: string
  best?: number | null
  status?: GameStatus
}

/**
 * HUD en HTML encima del canvas. No se dibuja adentro del juego a propósito:
 * ver la regla en `GameModule.ts` sobre el atlas de fuente de Kaplay.
 */
export function GameHud({ score, scoreLabel = 'Puntaje', best, status }: Props) {
  return (
    <div className="game-hud" aria-live="polite">
      <Cell label={scoreLabel} value={score} strong />
      {best !== undefined && best !== null && <Cell label="Récord" value={best} />}
      {status &&
        Object.entries(status).map(([label, value]) => (
          <Cell key={label} label={label} value={value} />
        ))}
    </div>
  )
}

function Cell({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string | number
  strong?: boolean
}) {
  return (
    <div className="game-hud__cell">
      <div className={`game-hud__value ${strong ? 'is-strong' : ''}`}>{value}</div>
      <div className="game-hud__label">{label}</div>
    </div>
  )
}
