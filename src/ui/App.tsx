import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAdmin, RequireAuth } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { JoinPage } from './pages/JoinPage'
import { EventPage } from './pages/EventPage'
import { FreePlayPage } from './pages/FreePlayPage'
import { PlayPage } from './pages/PlayPage'
import { AccountPage } from './pages/AccountPage'
import { AdminPage } from './pages/AdminPage'
import { AddressesAdminPage } from './pages/admin/AddressesAdminPage'
import { ProductsAdminPage } from './pages/admin/ProductsAdminPage'
import { OrdersAdminPage } from './pages/admin/OrdersAdminPage'
import { DeliveryAdminPage } from './pages/admin/DeliveryAdminPage'
import { DeliveryLivePage } from './pages/admin/DeliveryLivePage'
import { OrdersPage } from './pages/OrdersPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SandboxPage } from './pages/SandboxPage'
import { SandboxOffPage } from './pages/SandboxOffPage'
import { sandboxEnabled } from './lib/features'
import { AnalyticsTracker } from './analytics/AnalyticsTracker'

export function App() {
  return (
    <>
      <AnalyticsTracker />
      <Routes>
        <Route element={<Layout />}>
          {/* Público */}
          <Route path="/" element={<HomePage />} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/codigo" element={<JoinPage />} />
          <Route path="/codigo/:code" element={<JoinPage />} />
          <Route path="/concurso/:slug" element={<EventPage />} />
          <Route path="/jugar" element={<FreePlayPage />} />

          {/* Requiere sesión */}
          <Route element={<RequireAuth />}>
            <Route path="/concurso/:slug/:gameSlug" element={<PlayPage />} />
            <Route path="/cuenta" element={<AccountPage />} />
            <Route path="/pedidos" element={<OrdersPage />} />
          </Route>

          {/* Solo admin */}
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/direcciones" element={<AddressesAdminPage />} />
            <Route path="/admin/combos" element={<ProductsAdminPage />} />
            <Route path="/admin/pedidos" element={<OrdersAdminPage />} />
            <Route path="/admin/envio" element={<DeliveryAdminPage />} />
            <Route path="/admin/reparto" element={<DeliveryLivePage />} />
          </Route>

          {/* Banco de pruebas de juegos. Ver src/ui/lib/features.ts.
              Cuando está apagado la ruta igual existe, pero explica por qué: así se
              distingue "falta la variable" de "falta la reescritura del hosting". */}
          <Route path="/sandbox" element={sandboxEnabled ? <SandboxPage /> : <SandboxOffPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  )
}
