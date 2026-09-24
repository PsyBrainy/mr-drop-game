/**
 * El analytics de la app. Sale de dos variables de Vercel:
 *
 * - `VITE_GA_MEASUREMENT_ID`: el id de GA4 (`G-…`). Sin él no se carga nada.
 * - `VITE_GA_DEBUG=true`: manda todo en modo debug, para verlo en vivo en
 *   GA → Administrar → DebugView mientras se prueba.
 *
 * Todo el resto de la app usa `analytics.track(...)` sin saber si está prendido.
 */

import { createGoogleAnalytics, NO_ANALYTICS, type Analytics } from './googleAnalytics'

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? ''
const debug = import.meta.env.VITE_GA_DEBUG === 'true'

function loadScript(src: string): void {
  const script = document.createElement('script')
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

export const analytics: Analytics =
  measurementId && typeof window !== 'undefined'
    ? createGoogleAnalytics({ measurementId, debug, target: window, loadScript })
    : NO_ANALYTICS

export { installAutoTracking } from './autoTrack'
export { safePath } from './googleAnalytics'
export type { AnalyticsItem, AnalyticsParams } from './googleAnalytics'
