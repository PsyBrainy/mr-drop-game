import type { LeaderboardEntry } from '../../domain/leaderboard/LeaderboardEntry'
import { Avatar } from './Avatar'

interface Props {
  entries: readonly LeaderboardEntry[]
  currentUserId?: string | null
  showGame?: boolean
}

export function Leaderboard({ entries, currentUserId, showGame = false }: Props) {
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
          {showGame && <th>Juego</th>}
          <th style={{ textAlign: 'right' }}>Puntaje</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => (
          <tr key={`${entry.userId}-${entry.gameSlug}`} className={entry.userId === currentUserId ? 'is-me' : ''}>
            <td className="board__pos">{index + 1}</td>
            <td>
              <span className="board__player">
                <Avatar displayName={entry.displayName} avatarUrl={entry.avatarUrl} />
                {entry.displayName || 'Dropper'}
              </span>
            </td>
            {showGame && <td className="muted">{entry.gameSlug}</td>}
            <td className="board__score">
              <div>{entry.bestScore.toLocaleString('es-AR')}</div>
              {entry.payload && (typeof entry.payload.obstaculos === 'number' || typeof entry.payload.cogollos === 'number') && (
                <div className="muted" style={{ fontSize: '0.75em', marginTop: '2px', fontWeight: 'normal' }}>
                  {(entry.payload.obstaculos as number) ?? 0} obst. / {(entry.payload.cogollos as number) ?? 0} cog.
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
