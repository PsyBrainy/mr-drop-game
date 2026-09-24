import { useUseCases } from '../providers/ContainerProvider'
import { useAsync } from '../hooks/useAsync'
import type { FightRecord } from '../../domain/fight/FightRecord'
import { Avatar } from './Avatar'

interface Props {
  eventGameId: string
  currentUserId?: string | null
  /** Cambiarlo vuelve a pedir el ranking (por ejemplo, al terminar una pelea). */
  refreshKey?: unknown
  limit?: number
}

/**
 * El ranking de la pelea: ganadas y perdidas. Se carga solo, así se puede poner
 * en cualquier pantalla que tenga el juego del concurso.
 */
export function FightRanking({ eventGameId, currentUserId = null, refreshKey, limit = 10 }: Props) {
  const { getFightBoard } = useUseCases()
  const board = useAsync(
    () => getFightBoard.forEventGame(eventGameId, currentUserId, limit),
    [eventGameId, currentUserId, limit, refreshKey, getFightBoard],
  )

  if (board.loading && !board.data) return <div className="skeleton" style={{ height: '5rem' }} />
  if (board.error) return <p className="alert alert--error">{board.error}</p>

  const { top = [], mine = null, myPosition = null } = board.data ?? {}
  const mineOutside = mine !== null && myPosition !== null && myPosition > top.length

  return (
    <div className="stack" style={{ gap: '0.6rem' }}>
      {top.length === 0 ? (
        <div className="empty-state">
          Todavía no hay peleas en el ranking. <strong>Ganá la primera.</strong>
        </div>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th className="board__pos">#</th>
              <th>Jugador</th>
              <th className="board__num">Ganadas</th>
              <th className="board__num">Perdidas</th>
            </tr>
          </thead>
          <tbody>
            {top.map((record, index) => (
              <Row key={record.userId} record={record} position={index + 1} isMe={record.userId === currentUserId} />
            ))}
            {mineOutside && (
              <>
                <tr className="board__gap" aria-hidden="true">
                  <td colSpan={4}>⋯</td>
                </tr>
                <Row record={mine} position={myPosition} isMe />
              </>
            )}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
        Cuentan las peleas online contra personas. Cada resultado se confirma volviendo a jugar la
        partida, y aparece acá un minuto después de terminar. Irse en el medio cuenta como derrota.
        Contra la máquina no suma.
      </p>
    </div>
  )
}

function Row({ record, position, isMe }: { record: FightRecord; position: number; isMe: boolean }) {
  return (
    <tr className={isMe ? 'is-me' : ''}>
      <td className="board__pos">{position}</td>
      <td>
        <span className="board__player">
          <Avatar displayName={record.displayName} avatarUrl={record.avatarUrl} />
          {record.displayName || 'Dropper'}
        </span>
      </td>
      <td className="board__num board__num--win">{record.wins}</td>
      <td className="board__num board__num--loss">{record.losses}</td>
    </tr>
  )
}
