import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { isSupabaseConfigured } from '../../infrastructure/supabase/client'

export function Layout() {
  const { isAuthenticated, isAdmin, profile, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand">
            <img src="/drop.svg" alt="" aria-hidden="true" />
            MrDrop
          </Link>
          <nav className="site-nav">
            <NavLink to="/" end>Inicio</NavLink>
            <NavLink to="/codigo" aria-label="Tengo un código">
              <span className="nav-full">Tengo un código</span>
              <span className="nav-short">Código</span>
            </NavLink>
            {isAdmin && <NavLink to="/admin">Panel</NavLink>}
            {isAuthenticated ? (
              <>
                <NavLink to="/cuenta" aria-label="Mi cuenta">
                  <span className="nav-full">{profile?.displayName || 'Mi cuenta'}</span>
                  <span className="nav-short">Cuenta</span>
                </NavLink>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
                  Salir
                </button>
              </>
            ) : (
              <Link to="/entrar" className="btn btn--sm">Ingresar</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        {!isSupabaseConfigured && <SetupNotice />}
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <span>MrDrop · comunidad</span>
          <span className="muted">+18. Jugá con responsabilidad.</span>
        </div>
      </footer>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="container" style={{ marginBottom: '1.5rem' }}>
      <div className="alert alert--warn">
        <strong>Falta conectar Supabase.</strong> Copiá <code>.env.example</code> a <code>.env</code>,
        completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, y reiniciá
        el servidor. Mientras tanto, la home se ve pero no hay login ni concursos.
      </div>
    </div>
  )
}
