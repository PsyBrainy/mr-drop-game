import { useCallback, useRef, useState } from 'react'
import { errorMessage } from './useAsync'

/** Envuelve una acción del usuario: estado de envío + error, sin dobles clics. */
export function useAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(
    async (...args: Args): Promise<Result | undefined> => {
      if (inFlight.current) return undefined
      inFlight.current = true
      setPending(true)
      setError(null)
      try {
        return await action(...args)
      } catch (cause) {
        setError(errorMessage(cause))
        return undefined
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [action],
  )

  return { run, pending, error, clearError: () => setError(null) }
}
