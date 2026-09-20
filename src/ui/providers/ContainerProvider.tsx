import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createContainer, type Container } from '../../infrastructure/container'

const ContainerContext = createContext<Container | null>(null)

export function ContainerProvider({ children }: { children: ReactNode }) {
  const container = useMemo(() => createContainer(), [])
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}

export function useContainer(): Container {
  const container = useContext(ContainerContext)
  if (!container) throw new Error('useContainer debe usarse dentro de <ContainerProvider>')
  return container
}

export function useUseCases() {
  return useContainer().usecases
}

export function useRepositories() {
  return useContainer().repositories
}
