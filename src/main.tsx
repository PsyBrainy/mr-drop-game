import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './ui/App'
import { AuthProvider } from './ui/providers/AuthProvider'
import { ContainerProvider } from './ui/providers/ContainerProvider'
import { ConfirmProvider } from './ui/providers/ConfirmProvider'
import { OrderRoundProvider } from './ui/providers/OrderRoundProvider'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('Falta <div id="root"> en index.html')

createRoot(root).render(
  <StrictMode>
    <ContainerProvider>
      <AuthProvider>
        <BrowserRouter>
          <OrderRoundProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </OrderRoundProvider>
        </BrowserRouter>
      </AuthProvider>
    </ContainerProvider>
  </StrictMode>,
)
