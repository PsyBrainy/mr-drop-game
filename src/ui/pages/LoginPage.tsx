import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { useAction } from '../hooks/useAction'

type Mode = 'signin' | 'signup'

export function LoginPage() {
  const { signIn, signUp, isAuthenticated, loading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmation, setConfirmation] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/codigo'
  const action = useAction(async () => {
    if (mode === 'signin') {
      await signIn({ email, password })
      return
    }
    const result = await signUp({ email, password, displayName })
    if (result.needsEmailConfirmation) setConfirmation(true)
  })

  if (!loading && isAuthenticated) return <Navigate to={from} replace />

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void action.run()
  }

  return (
    <div className="container container--narrow">
      <div className="card card--pad-lg">
        <h1 style={{ fontSize: '1.8rem' }}>{mode === 'signin' ? 'Ingresar' : 'Crear cuenta'}</h1>
        <p className="muted">
          {mode === 'signin'
            ? 'Entrá para canjear tu código y jugar.'
            : 'Tu nombre es el que va a aparecer en el ranking.'}
        </p>

        {confirmation && (
          <div className="alert alert--ok">
            Te mandamos un mail para confirmar la cuenta. Abrilo y volvé a ingresar.
          </div>
        )}
        {action.error && <div className="alert alert--error">{action.error}</div>}

        <form onSubmit={onSubmit}>
          {mode === 'signup' && (
            <label className="field">
              <span className="field__label">Nombre en el ranking</span>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Cómo te conocen en la comu"
                required
                minLength={2}
                maxLength={40}
                autoComplete="nickname"
              />
            </label>
          )}

          <label className="field">
            <span className="field__label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span className="field__label">Contraseña</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>

          <button type="submit" className="btn btn--block" disabled={action.pending}>
            {action.pending ? 'Un segundo…' : mode === 'signin' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>

        <p className="center muted" style={{ marginTop: '1.2rem', marginBottom: 0, fontSize: '0.9rem' }}>
          {mode === 'signin' ? '¿Todavía no tenés cuenta? ' : '¿Ya tenés cuenta? '}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              action.clearError()
            }}
          >
            {mode === 'signin' ? 'Registrate' : 'Ingresá'}
          </button>
        </p>
      </div>

      <p className="center muted" style={{ marginTop: '1rem', fontSize: '0.88rem' }}>
        <Link to="/">Volver al inicio</Link>
      </p>
    </div>
  )
}
