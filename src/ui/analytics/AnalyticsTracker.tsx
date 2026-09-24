import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { analytics, installAutoTracking, safePath } from '../../infrastructure/analytics'
import { useAuth } from '../providers/AuthProvider'
import { pageInfo } from './pageName'

/**
 * Lo que se trackea para toda la app: cada página vista (es una app de una sola
 * página, así que GA no las ve solo), quién está logueado, y los clicks,
 * formularios y errores (ver `autoTrack.ts`). No pinta nada.
 */
export function AnalyticsTracker() {
  const location = useLocation()
  const { userId, isAdmin, loading } = useAuth()
  const lastPath = useRef<string | null>(null)

  useEffect(() => installAutoTracking(analytics, document, window), [])

  // Quién es, antes que las páginas: así la primera página ya sale con su id.
  useEffect(() => {
    if (loading) return
    analytics.identify(userId, { is_admin: isAdmin })
  }, [userId, isAdmin, loading])

  useEffect(() => {
    if (loading) return
    const path = safePath(location.pathname, location.search)
    // StrictMode monta dos veces en desarrollo: la misma página no se cuenta dos veces.
    if (path === lastPath.current) return
    lastPath.current = path
    const info = pageInfo(location.pathname)
    document.title = info.title === 'Inicio' ? 'Mister Drop · Comunidad' : `${info.title} · Mister Drop`
    analytics.pageView(path, info.title, info.params)
  }, [location.pathname, location.search, loading])

  return null
}
