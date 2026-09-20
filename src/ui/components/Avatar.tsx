import { initialsOf } from '../../domain/user/Profile'

interface Props {
  displayName: string
  avatarUrl?: string | null
  size?: number
}

export function Avatar({ displayName, avatarUrl, size = 28 }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (avatarUrl) {
    return <img className="avatar" style={style} src={avatarUrl} alt="" aria-hidden="true" />
  }
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {initialsOf({ id: '', displayName, avatarUrl: null, role: 'player' })}
    </span>
  )
}
