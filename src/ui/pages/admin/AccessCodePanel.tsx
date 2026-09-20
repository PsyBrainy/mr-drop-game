import { useState, type FormEvent } from 'react'
import { useRepositories } from '../../providers/ContainerProvider'
import { useAsync } from '../../hooks/useAsync'
import { useAction } from '../../hooks/useAction'
import { AccessCode } from '../../../domain/access/AccessCode'

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function AccessCodePanel({ eventId }: { eventId: string }) {
  const { accessCodes } = useRepositories()
  const codes = useAsync(() => accessCodes.listForEvent(eventId), [eventId, accessCodes])

  const [code, setCode] = useState(randomCode)
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState(50)
  const [copied, setCopied] = useState<string | null>(null)

  const create = useAction(async () => {
    await accessCodes.create({ eventId, code, label: label.trim(), maxUses, expiresAt: null })
    setCode(randomCode())
    setLabel('')
    codes.reload()
  })

  const toggle = useAction(async (id: string, isActive: boolean) => {
    await accessCodes.setActive(id, isActive)
    codes.reload()
  })

  const copyLink = async (value: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/codigo/${value}`)
    setCopied(value)
    window.setTimeout(() => setCopied(null), 1800)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void create.run()
  }

  return (
    <section className="card stack">
      <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Códigos de acceso</h2>
      <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
        Cada código habilita a entrar al concurso. Podés hacer uno por persona o uno masivo
        con cupo.
      </p>

      {(codes.error || create.error || toggle.error) && (
        <div className="alert alert--error">{codes.error ?? create.error ?? toggle.error}</div>
      )}

      <form className="row" onSubmit={onSubmit} style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ margin: 0, flex: '1 1 160px' }}>
          <span className="field__label">Código</span>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(AccessCode.normalize(e.target.value))}
            maxLength={32}
            required
          />
        </label>
        <label className="field" style={{ margin: 0, flex: '1 1 160px' }}>
          <span className="field__label">Etiqueta</span>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej: growshop centro"
            maxLength={60}
          />
        </label>
        <label className="field" style={{ margin: 0, flex: '0 1 110px' }}>
          <span className="field__label">Usos</span>
          <input
            className="input"
            type="number"
            min={1}
            max={100000}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="btn" disabled={create.pending || !AccessCode.isValid(code)}>
          {create.pending ? 'Creando…' : 'Crear'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCode(randomCode())}>
          Generar otro
        </button>
      </form>

      {codes.loading ? (
        <div className="skeleton" style={{ height: '4rem' }} />
      ) : (codes.data ?? []).length === 0 ? (
        <div className="empty-state">Todavía no hay códigos para este concurso.</div>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th>Código</th>
              <th>Etiqueta</th>
              <th>Usos</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(codes.data ?? []).map((item) => (
              <tr key={item.id} style={{ opacity: item.isActive ? 1 : 0.5 }}>
                <td><span className="code-pill">{item.code}</span></td>
                <td className="muted">{item.label || '—'}</td>
                <td className="muted">{item.usedCount} / {item.maxUses}</td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => void copyLink(item.code)}>
                      {copied === item.code ? '¡Copiado!' : 'Copiar link'}
                    </button>
                    <button
                      className={`btn btn--sm ${item.isActive ? 'btn--danger' : 'btn--ghost'}`}
                      disabled={toggle.pending}
                      onClick={() => void toggle.run(item.id, !item.isActive)}
                    >
                      {item.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
