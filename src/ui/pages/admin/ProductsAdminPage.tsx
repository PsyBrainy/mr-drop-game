import { useState, type FormEvent } from 'react'
import { Package, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatPrice, type Product } from '../../../domain/order/Product'
import { useRepositories } from '../../providers/ContainerProvider'
import { useConfirm } from '../../providers/ConfirmProvider'
import { useAsync } from '../../hooks/useAsync'
import { useAction } from '../../hooks/useAction'

export function ProductsAdminPage() {
  const { products } = useRepositories()
  const list = useAsync(() => products.list(), [products])

  return (
    <div className="container stack">
      <div className="row admin-header">
        <h1 style={{ margin: 0 }}>Combos</h1>
        <span className="spacer" />
        <Link to="/admin/pedidos" className="btn btn--ghost btn--sm">
          <Package className="admin-tab-icon" size={18} />
          <span className="admin-tab-text">Pedidos</span>
        </Link>
        <Link to="/admin" className="btn btn--ghost btn--sm">
          <ArrowLeft className="admin-tab-icon" size={18} />
          <span className="admin-tab-text">← Concursos</span>
        </Link>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
        Lo que los usuarios pueden pedir. Un combo desactivado deja de aparecer, pero los
        pedidos que ya lo tenían no cambian.
      </p>

      <ProductForm onSaved={() => list.reload()} />

      {list.error && <div className="alert alert--error">{list.error}</div>}

      {list.loading ? (
        <div className="skeleton" style={{ height: '6rem' }} />
      ) : (list.data ?? []).length === 0 ? (
        <div className="empty-state">Todavía no hay combos. Creá el primero arriba.</div>
      ) : (
        <div className="stack">
          {(list.data ?? []).map((product) => (
            <ProductCard key={product.id} product={product} onChanged={() => list.reload()} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductForm({
  product,
  onSaved,
  onCancel,
}: {
  product?: Product
  onSaved: () => void
  onCancel?: () => void
}) {
  const { products } = useRepositories()
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [description, setDescription] = useState(product?.description ?? '')

  const save = useAction(async () => {
    const draft = { name: name.trim(), description: description.trim(), price: Number(price) }
    if (product) await products.update(product.id, draft)
    else await products.create(draft)
    if (!product) {
      setName('')
      setPrice('')
      setDescription('')
    }
    onSaved()
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void save.run()
  }

  const valid = name.trim().length > 0 && Number.isFinite(Number(price)) && Number(price) >= 0

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{product ? 'Editar combo' : 'Nuevo combo'}</h2>
      {save.error && <div className="alert alert--error">{save.error}</div>}

      <div className="grid grid--2">
        <label className="field" style={{ margin: 0 }}>
          <span className="field__label">Nombre</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="field__label">Precio (ARS)</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="field" style={{ margin: 0 }}>
        <span className="field__label">Detalle</span>
        <textarea
          className="textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={400}
          placeholder="Qué trae el combo."
        />
      </label>

      <div className="row">
        <button type="submit" className="btn" disabled={save.pending || !valid}>
          {save.pending ? 'Guardando…' : product ? 'Guardar' : 'Crear combo'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

function ProductCard({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const { products } = useRepositories()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)

  const toggle = useAction(async (isActive: boolean) => {
    await products.update(product.id, { isActive })
    onChanged()
  })

  const remove = useAction(async () => {
    await products.delete(product.id)
    onChanged()
  })

  const askDelete = async () => {
    const ok = await confirm({
      title: `¿Borrar "${product.name}"?`,
      message: 'Desaparece del catálogo. Los pedidos que ya lo tenían conservan el nombre y el precio.',
      confirmLabel: 'Borrar combo',
      danger: true,
    })
    if (ok) void remove.run()
  }

  if (editing) {
    return (
      <ProductForm
        product={product}
        onSaved={() => {
          setEditing(false)
          onChanged()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="card toggle-row" style={{ opacity: product.isActive ? 1 : 0.55 }}>
      <div className="toggle-row__info">
        <div className="toggle-row__name">
          {product.name} <span className="event-card__prize">{formatPrice(product.price)}</span>
          {!product.isActive && <span className="badge badge--closed" style={{ marginLeft: '0.5rem' }}>inactivo</span>}
        </div>
        {product.description && (
          <div className="muted" style={{ fontSize: '0.85rem' }}>{product.description}</div>
        )}
        {(toggle.error || remove.error) && (
          <div className="alert alert--error">{toggle.error ?? remove.error}</div>
        )}
      </div>
      <div className="row" style={{ flex: 'none' }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
          Editar
        </button>
        <button type="button" className="btn btn--danger btn--sm" disabled={remove.pending} onClick={() => void askDelete()}>
          Borrar
        </button>
        <label className="switch">
          <input
            type="checkbox"
            checked={product.isActive}
            disabled={toggle.pending}
            onChange={(e) => void toggle.run(e.target.checked)}
            aria-label={`Activar ${product.name}`}
          />
          <span className="switch__track" />
        </label>
      </div>
    </div>
  )
}
