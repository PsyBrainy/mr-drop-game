import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAdmin, RequireAuth } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { JoinPage } from './pages/JoinPage'
import { EventPage } from './pages/EventPage'
import { PlayPage } from './pages/PlayPage'
import { AccountPage } from './pages/AccountPage'
import { AdminPage } from './pages/AdminPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SandboxPage } from './pages/SandboxPage'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Público */}
        <Route path="/" element={<HomePage />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/codigo" element={<JoinPage />} />
        <Route path="/codigo/:code" element={<JoinPage />} />
        <Route path="/concurso/:slug" element={<EventPage />} />

        {/* Requiere sesión */}
        <Route element={<RequireAuth />}>
          <Route path="/concurso/:slug/:gameSlug" element={<PlayPage />} />
          <Route path="/cuenta" element={<AccountPage />} />
        </Route>

        {/* Solo admin */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        {/* Banco de pruebas de juegos: no se incluye en el build de produccion */}
        {import.meta.env.DEV && <Route path="/sandbox" element={<SandboxPage />} />}

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
