import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageSpinner />
  if (!isAuthenticated) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export function RequireAdmin() {
  const { isAdmin, loading, isAuthenticated } = useAuth()

  if (loading) return <PageSpinner />
  if (!isAuthenticated) return <Navigate to="/entrar" replace />
  if (!isAdmin) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>Zona de admins</h2>
          <p className="muted">Tu cuenta no tiene permisos para el panel de MrDrop.</p>
        </div>
      </div>
    )
  }
  return <Outlet />
}

export function PageSpinner() {
  return (
    <div className="container stack" aria-busy="true">
      <div className="skeleton" style={{ height: '2rem', width: '40%' }} />
      <div className="skeleton" style={{ height: '8rem' }} />
    </div>
  )
}
