import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../providers/ContainerProvider'
import { useAsync } from '../../hooks/useAsync'
import { formatCoordinates, wazeNavigationUrl } from '../../../domain/user/UserAddress'
import { Avatar } from '../../components/Avatar'
import { LazyAddressesOverviewMap } from '../../components/map/lazy'

const dateFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export function AddressesAdminPage() {
  const { addresses } = useRepositories()
  const list = useAsync(() => addresses.listAll(), [addresses])
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = list.data ?? []
    if (!needle) return all
    return all.filter(
      (item) =>
        item.displayName.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle),
    )
  }, [list.data, query])

  return (
    <div className="container stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Direcciones</h1>
        <span className="spacer" />
        <Link to="/admin" className="btn btn--ghost btn--sm">← Concursos</Link>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
        Usuarios que marcaron su dirección en <span className="code-pill">/cuenta</span>. El botón
        de Waze abre la app con la navegación lista.
      </p>

      {list.error && <div className="alert alert--error">{list.error}</div>}

      {list.loading ? (
        <div className="skeleton" style={{ height: '8rem' }} />
      ) : (list.data ?? []).length === 0 ? (
        <div className="empty-state">Todavía nadie cargó su dirección.</div>
      ) : (
        <>
          <LazyAddressesOverviewMap addresses={filtered} />

          <section className="card stack">
            <div className="row">
              <input
                className="input"
                placeholder="Buscar por nombre o referencia…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: '1 1 220px' }}
              />
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {filtered.length} de {list.data?.length ?? 0}
              </span>
            </div>

            <table className="board board--stack">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Referencia</th>
                  <th>Coordenadas</th>
                  <th>Actualizado</th>
                  <th style={{ textAlign: 'right' }}>Ir</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.userId}>
                    <td data-label="Usuario">
                      <div className="board__player">
                        <Avatar displayName={item.displayName} avatarUrl={item.avatarUrl} />
                        {item.displayName}
                      </div>
                    </td>
                    <td className="muted" data-label="Referencia">{item.label || '—'}</td>
                    <td className="muted" data-label="Coordenadas" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatCoordinates(item)}
                    </td>
                    <td className="muted" data-label="Actualizado">{dateFormat.format(item.updatedAt)}</td>
                    <td data-label="" style={{ textAlign: 'right' }}>
                      <a
                        className="btn btn--sm"
                        href={wazeNavigationUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Waze
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
