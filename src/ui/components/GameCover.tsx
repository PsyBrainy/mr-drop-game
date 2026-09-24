import { useState } from 'react'
import type { Game } from '../../domain/game/Game'
import { gameCoverUrl } from '../../games/registry'

/**
 * La imagen de la tarjeta de un juego: una captura del juego (o la que haya
 * cargado el admin). Si no hay, o no carga, queda el joystick de siempre.
 */
export function GameCover({ game }: { game: Game }) {
  const src = gameCoverUrl(game.slug, game.coverUrl)
  const [broken, setBroken] = useState(false)

  return (
    <div className="game-card__cover">
      {src && !broken ? (
        <img src={src} alt={`Captura de ${game.name}`} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">🎮</span>
      )}
    </div>
  )
}
