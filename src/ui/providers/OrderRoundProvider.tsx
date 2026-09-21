import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { OrderRound } from '../../domain/order/Order'
import { useAuth } from './AuthProvider'
import { useRepositories } from './ContainerProvider'

interface OrderRoundState {
  /** La camada abierta, o null si los pedidos están cerrados. */
  openRound: OrderRound | null
  loading: boolean
  refresh: () => Promise<void>
}

const OrderRoundContext = createContext<OrderRoundState | null>(null)

/**
 * Mientras no haya camada abierta, los pedidos no existen para el usuario:
 * ni link en la barra ni pantalla. Se reconsulta al cambiar de ruta para que
 * abrir/cerrar desde el panel se refleje sin recargar.
 */
export function OrderRoundProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { orders } = useRepositories()
  const { pathname } = useLocation()
  const [openRound, setOpenRound] = useState<OrderRound | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) return
    if (!isAuthenticated) {
      setOpenRound(null)
      setLoading(false)
      return
    }
    try {
      setOpenRound(await orders.getOpenRound())
    } catch {
      setOpenRound(null)
    } finally {
      setLoading(false)
    }
  }, [authLoading, isAuthenticated, orders])

  useEffect(() => {
    void refresh()
  }, [refresh, pathname])

  return (
    <OrderRoundContext.Provider value={{ openRound, loading, refresh }}>
      {children}
    </OrderRoundContext.Provider>
  )
}

export function useOpenRound(): OrderRoundState {
  const state = useContext(OrderRoundContext)
  if (!state) throw new Error('useOpenRound debe usarse dentro de <OrderRoundProvider>')
  return state
}
