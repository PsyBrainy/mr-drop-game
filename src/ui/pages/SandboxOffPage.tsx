import { Link } from 'react-router-dom'
import { sandboxFlagValue } from '../lib/features'

/**
 * Se muestra cuando alguien entra a /sandbox en un build que lo tiene apagado.
 *
 * Existe para que el diagnóstico sea evidente: si ves ESTA página, el ruteo del
 * hosting funciona y lo que falló es la variable. Si en cambio ves el 404 del
 * hosting (sin la barra de MrDrop), el problema es que falta la regla de
 * reescritura a index.html.
 */
export function SandboxOffPage() {
  return (
    <div className="container container--narrow">
      <div className="card card--pad-lg stack">
        <h1 style={{ fontSize: '1.6rem', marginBottom: 0 }}>El sandbox está apagado</h1>

        <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 0 }}>
          Actualmente el Sandbox no esta disponible. Disculpa las molestias
        </p>

        <div className="row">
          <Link to="/" className="btn btn--ghost btn--sm">Volver al inicio</Link>
        </div>
      </div>
    </div>
  )
}
