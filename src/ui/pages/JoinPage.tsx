import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AccessCode } from '../../domain/access/AccessCode'
import { useAuth } from '../providers/AuthProvider'
import { useUseCases } from '../providers/ContainerProvider'
import { useAction } from '../hooks/useAction'
import { pendingCode } from '../lib/pendingCode'

/**
 * Puerta de entrada del link que se reparte en la comunidad:
 * /codigo/ABC123 (o /codigo?c=ABC123) deja el código listo para canjear.
 */
export function JoinPage() {
  const { code: codeParam } = useParams<{ code?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()
  const { redeemAccessCode } = useUseCases()

  const incoming = codeParam ?? searchParams.get('c') ?? pendingCode.read() ?? ''
  const [code, setCode] = useState(AccessCode.normalize(incoming))
  const [autoTried, setAutoTried] = useState(false)

  const redeem = useAction(async (raw: string) => {
    const result = await redeemAccessCode.execute(raw)
    pendingCode.clear()
    navigate(`/concurso/${result.eventSlug}`, {
      replace: true,
      state: { joined: !result.alreadyJoined },
    })
  })

  // Si llegó con código en el link y ya está logueado, se canjea solo.
  useEffect(() => {
    if (loading || autoTried) return
    const raw = codeParam ?? searchParams.get('c') ?? ''
    if (!raw || !AccessCode.isValid(raw)) return

    setAutoTried(true)
    if (!isAuthenticated) {
      pendingCode.save(AccessCode.normalize(raw))
      return
    }
    void redeem.run(raw)
  }, [loading, isAuthenticated, codeParam, searchParams, autoTried, redeem])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!isAuthenticated) {
      pendingCode.save(AccessCode.normalize(code))
      navigate('/entrar', { state: { from: '/codigo' } })
      return
    }
    void redeem.run(code)
  }

  const valid = AccessCode.isValid(code)

  return (
    <div className="container container--narrow">
      <div className="card card--pad-lg">
        <h1 style={{ fontSize: '1.8rem' }}>Entrá al concurso</h1>
        <p className="muted">Poné el código que te pasaron para desbloquear los juegos del evento.</p>

        {redeem.error && <div className="alert alert--error">{redeem.error}</div>}
        {!isAuthenticated && !loading && (
          <div className="alert alert--warn">
            Para participar necesitás una cuenta. Guardamos tu código y seguís donde quedaste.
          </div>
        )}

        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Código de acceso</span>
            <input
              className="input input--code"
              value={code}
              onChange={(e) => setCode(AccessCode.normalize(e.target.value))}
              placeholder="MRDROP24"
              maxLength={32}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>

          <button type="submit" className="btn btn--block" disabled={!valid || redeem.pending}>
            {redeem.pending ? 'Validando…' : isAuthenticated ? 'Canjear código' : 'Continuar'}
          </button>
        </form>

        {code.length > 0 && !valid && (
          <p className="muted center" style={{ fontSize: '0.85rem', marginTop: '0.8rem' }}>
            El código lleva entre 4 y 32 letras, números o guiones.
          </p>
        )}
      </div>

      <p className="center muted" style={{ marginTop: '1rem', fontSize: '0.88rem' }}>
        ¿No tenés código? <Link to="/">Mirá los concursos abiertos</Link>
      </p>
    </div>
  )
}
