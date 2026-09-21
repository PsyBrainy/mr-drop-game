import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { useOpenRound } from '../providers/OrderRoundProvider'
import { isSupabaseConfigured } from '../../infrastructure/supabase/client'

export function Layout() {
  const { isAuthenticated, isAdmin, profile, signOut } = useAuth()
  const { openRound } = useOpenRound()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand">
            <img src="/drop.svg" alt="" aria-hidden="true" />
            Mister Drop
          </Link>
          <button
            type="button"
            className={`nav-toggle ${menuOpen ? 'is-open' : ''}`}
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
          <nav id="site-nav" className={`site-nav ${menuOpen ? 'is-open' : ''}`}>
            <NavLink to="/" end>Inicio</NavLink>
            <NavLink to="/jugar">Jugar</NavLink>
            <NavLink to="/codigo">Tengo un código</NavLink>
            {isAuthenticated && openRound && <NavLink to="/pedidos">Pedidos</NavLink>}
            {isAdmin && <NavLink to="/admin">Panel</NavLink>}
            {isAuthenticated ? (
              <>
                <NavLink to="/cuenta">{profile?.displayName || 'Mi cuenta'}</NavLink>
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
          <span>Mister Drop · comunidad</span>
          <span className="muted">+18. Jugá con responsabilidad.</span>
          <span className="muted">
            Desarrollado por{' '}
            <a href="https://psybrainy.com" target="_blank" rel="noopener noreferrer">
              PsyBrainy
            </a>
          </span>
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
