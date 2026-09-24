import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useContainer } from '../providers/ContainerProvider'

/**
 * La consola de reparto de esta pantalla: se conecta al montar y se apaga al
 * desmontar (en StrictMode monta, desmonta y vuelve a montar: `start` después
 * de `stop` abre un canal nuevo).
 */
export function useDeliveryConsole() {
  const { live } = useContainer()
  const console = useMemo(() => live.createDeliveryConsole(), [live])

  useEffect(() => {
    console.start()
    return () => console.stop()
  }, [console])

  const view = useSyncExternalStore(console.subscribe, console.getView)
  return { view, console, configured: live.deliveryConfigured }
}
