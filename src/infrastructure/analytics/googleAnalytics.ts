/**
 * Google Analytics 4 (gtag.js), a mano y sin librerías.
 *
 * Es el mismo snippet que da Google, pero armado desde el código para que el
 * id salga de una variable (`VITE_GA_MEASUREMENT_ID`) y para poder mandar lo que
 * pasa en una app de una sola página: acá no hay recargas, así que las páginas
 * vistas se mandan a mano en cada cambio de ruta.
 *
 * Tres reglas que explican lo que se manda y lo que no:
 *
 * 1. **Nada de datos personales.** Google lo prohíbe en sus condiciones: ni
 *    mails, ni nombres, ni direcciones, ni teléfonos. Al usuario se lo
 *    identifica por su id de Supabase, que es un número al azar.
 * 2. **Nada de secretos en las URLs.** Los códigos de acceso viajan en la ruta
 *    (`/codigo/ABC123`, `?c=ABC123`) y los tokens de Supabase en la query al
 *    volver del mail: se tapan antes de mandar la página.
 * 3. **Si no hay id, no se carga nada.** Sin la variable, todo esto no hace
 *    nada: en desarrollo no se ensucian las métricas de producción.
 */

/** Un producto, para los eventos de comercio de GA (`add_to_cart`, `purchase`…). */
export type AnalyticsItem = Readonly<Record<string, string | number>>
export type AnalyticsValue = string | number | boolean | null | undefined | readonly AnalyticsItem[]
export type AnalyticsParams = Readonly<Record<string, AnalyticsValue>>
type Clean = string | number | boolean | Record<string, string | number | boolean>[]

export interface Analytics {
  readonly enabled: boolean
  /** Una página vista. `path` ya viene limpio de secretos (ver `safePath`). */
  pageView(path: string, title: string, params?: AnalyticsParams): void
  /** Quién es (id de Supabase) y qué es (admin o no). `null` al salir. */
  identify(userId: string | null, properties?: AnalyticsParams): void
  /** Un evento. El nombre en snake_case, como los de GA. */
  track(name: string, params?: AnalyticsParams): void
}

export const NO_ANALYTICS: Analytics = {
  enabled: false,
  pageView: () => {},
  identify: () => {},
  track: () => {},
}

/** GA corta los valores de texto a 100 caracteres; mejor cortarlos acá, con criterio. */
export const MAX_VALUE = 100
/** Y los nombres de parámetro a 40. */
const MAX_KEY = 40

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g

/** Limpia los parámetros: sin vacíos, sin mails, y con los largos que acepta GA. */
export function cleanParams(params: AnalyticsParams = {}): Record<string, Clean> {
  const out: Record<string, Clean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = key.slice(0, MAX_KEY)
    if (Array.isArray(value)) {
      // La lista de productos: cada uno se limpia igual. GA acepta hasta 200.
      const items = (value as readonly AnalyticsItem[]).slice(0, 200).map((item) => cleanParams(item) as Record<string, string | number | boolean>)
      if (items.length > 0) out[name] = items
    } else if (typeof value === 'string') {
      const text = value.replace(EMAIL, '[mail]').trim()
      if (text.length === 0) continue
      out[name] = text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[name] = value
    } else if (typeof value === 'boolean') {
      out[name] = value
    }
  }
  return out
}

/** Parámetros de la query que nunca se mandan: códigos de acceso y tokens. */
const SECRET_PARAMS = new Set(['c', 'code', 'token', 'token_hash', 'access_token', 'refresh_token', 'type'])

/**
 * La ruta sin secretos. El código de `/codigo/ABC123` se reemplaza por
 * `:codigo` (sigue sirviendo para saber que alguien entró por un link con
 * código), y la query pierde los parámetros de `SECRET_PARAMS`.
 */
export function safePath(pathname: string, search = ''): string {
  const path = pathname.replace(/^\/codigo\/[^/]+/i, '/codigo/:codigo')
  const query = new URLSearchParams(search)
  for (const key of [...query.keys()]) if (SECRET_PARAMS.has(key.toLowerCase())) query.delete(key)
  const rest = query.toString()
  return rest ? `${path}?${rest}` : path
}

type Gtag = (...args: unknown[]) => void

interface GtagWindow {
  dataLayer?: unknown[]
  gtag?: Gtag
  location: { origin: string }
}

export interface GoogleAnalyticsOptions {
  readonly measurementId: string
  /** Manda todo con `debug_mode`: se ve en vivo en GA → Administrar → DebugView. */
  readonly debug: boolean
  readonly target: GtagWindow
  /** Cómo se agrega el `<script>` de Google. Se inyecta para poder probarlo. */
  readonly loadScript: (src: string) => void
}

export function createGoogleAnalytics(options: GoogleAnalyticsOptions): Analytics {
  const { measurementId, debug, target } = options
  target.dataLayer = target.dataLayer ?? []
  const layer = target.dataLayer
  // gtag.js necesita el objeto `arguments` tal cual, no un array: es lo que
  // hace el snippet oficial y lo que su cola sabe leer.
  target.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments)
  }
  const gtag = target.gtag

  gtag('js', new Date())
  // La página vista la manda la app en cada cambio de ruta: si GA también la
  // mandara al cargar, la primera se contaría dos veces.
  gtag('config', measurementId, { send_page_view: false, ...(debug ? { debug_mode: true } : {}) })
  options.loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`)

  const withDebug = (params: Record<string, Clean>) => (debug ? { ...params, debug_mode: true } : params)

  return {
    enabled: true,
    pageView(path, title, params) {
      gtag(
        'event',
        'page_view',
        withDebug(
          cleanParams({
            ...params,
            page_location: `${target.location.origin}${path}`,
            page_path: path,
            page_title: title,
          }),
        ),
      )
    },
    identify(userId, properties) {
      // `user_id` junta las visitas de una misma persona en distintos
      // dispositivos. Es el id de Supabase: no dice quién es nadie.
      gtag('config', measurementId, { send_page_view: false, user_id: userId ?? undefined })
      gtag('set', 'user_properties', cleanParams({ ...properties, logged_in: userId !== null }))
    },
    track(name, params) {
      gtag('event', name, withDebug(cleanParams(params)))
    },
  }
}
