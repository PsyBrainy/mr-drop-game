import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="container">
      <div className="empty-state">
        <h1 style={{ fontSize: '2rem' }}>Esta página no existe</h1>
        <p className="muted">Puede que el link esté mal o que el concurso ya haya cerrado.</p>
        <Link to="/" className="btn btn--ghost btn--sm">Volver al inicio</Link>
      </div>
    </div>
  )
}
