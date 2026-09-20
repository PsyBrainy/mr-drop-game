import { domainError, isDomainErrorCode, DomainError } from '../../domain/shared/DomainError'

interface SupabaseLikeError {
  message?: string
  code?: string
  details?: string
}

/**
 * Las funciones SECURITY DEFINER levantan excepciones con el código de dominio
 * como mensaje (`raise exception 'CODE_EXPIRED'`). Acá se traduce de vuelta.
 */
export function translateError(error: SupabaseLikeError | null, fallback = 'UNEXPECTED' as const): DomainError {
  const raw = `${error?.message ?? ''} ${error?.details ?? ''}`
  const token = raw.match(/\b[A-Z][A-Z_]{3,}\b/g)?.find(isDomainErrorCode)
  if (token) return domainError(token)

  if (error?.code === 'PGRST301' || error?.code === '42501') return domainError('AUTH_REQUIRED')
  return domainError(fallback, error?.message)
}

export function unwrap<T>(result: { data: T | null; error: SupabaseLikeError | null }): T {
  if (result.error) throw translateError(result.error)
  if (result.data === null) throw domainError('UNEXPECTED', 'Respuesta vacía del servidor.')
  return result.data
}
