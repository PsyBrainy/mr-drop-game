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
        <p className="muted">
          Esta ruta solo existe si el build se hizo con <code>VITE_ENABLE_SANDBOX</code>
          en <code>true</code>.
        </p>

        <div className="alert alert--warn">
          Valor horneado en este build: <strong>{sandboxFlagValue}</strong>
        </div>

        <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 0 }}>
          Si dice <code>(sin definir)</code>, la variable no estaba presente al correr
          <code> npm run build</code>. Vite la reemplaza al compilar, no al servir: ponerla
          después en el panel del hosting no alcanza, hay que <strong>volver a buildear</strong>
          con la variable puesta. Tampoco sirve escribirla en <code>.env.example</code>,
          que es solo documentación: va en <code>.env</code> o en las variables de build
          del hosting.
        </p>

        <div className="row">
          <Link to="/" className="btn btn--ghost btn--sm">Volver al inicio</Link>
        </div>
      </div>
    </div>
  )
}
