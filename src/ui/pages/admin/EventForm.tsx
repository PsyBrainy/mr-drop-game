import { useState, type FormEvent } from 'react'
import { useRepositories } from '../../providers/ContainerProvider'
import { useAction } from '../../hooks/useAction'
import { slugify } from '../../lib/slugify'

export function EventForm({ onCreated }: { onCreated: () => void }) {
  const { events } = useRepositories()
  const [name, setName] = useState('')
  const [prize, setPrize] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const create = useAction(async () => {
    await events.create({
      slug: slugify(name),
      name: name.trim(),
      description: description.trim(),
      prize: prize.trim(),
      status: 'draft',
      startsAt: new Date(),
      endsAt: endsAt ? new Date(endsAt) : null,
    })
    onCreated()
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void create.run()
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Nuevo concurso</h2>
      {create.error && <div className="alert alert--error">{create.error}</div>}

      <div className="grid grid--2">
        <label className="field" style={{ margin: 0 }}>
          <span className="field__label">Nombre</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          {name && <span className="muted" style={{ fontSize: '0.78rem' }}>/{slugify(name)}</span>}
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="field__label">Premio</span>
          <input className="input" value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={120} />
        </label>
      </div>

      <label className="field" style={{ margin: 0 }}>
        <span className="field__label">Descripción</span>
        <textarea
          className="textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={400}
        />
      </label>

      <label className="field" style={{ margin: 0 }}>
        <span className="field__label">Cierra el (opcional)</span>
        <input
          className="input"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </label>

      <div className="row">
        <button type="submit" className="btn" disabled={create.pending || slugify(name).length < 3}>
          {create.pending ? 'Creando…' : 'Crear concurso'}
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>Se crea en borrador.</span>
      </div>
    </form>
  )
}
