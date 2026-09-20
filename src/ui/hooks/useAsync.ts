import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
  setData: (value: T | null) => void
}

/** Carga asincrónica con cancelación: evita setState sobre componentes desmontados. */
export function useAsync<T>(
  task: () => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)

  // El task cambia en cada render; las deps explícitas son el contrato.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(task, deps)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)

    run()
      .then((result) => active && setData(result))
      .catch((cause: unknown) => active && setError(errorMessage(cause)))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [run, enabled, nonce])

  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData }
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message
  return 'Algo salió mal. Probá de nuevo.'
}
