/**
 * Cómo se llama cada pantalla en Analytics. En GA los informes de "Páginas"
 * agrupan por título; con un título por tipo de pantalla (y el concurso o el
 * juego como parámetro aparte) se lee mucho mejor que una lista de URLs.
 */

export interface PageInfo {
  readonly title: string
  readonly params: Readonly<Record<string, string>>
}

export function pageInfo(pathname: string): PageInfo {
  const path = pathname.replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  const [first, second, third] = parts

  if (path === '/') return { title: 'Inicio', params: {} }
  switch (first) {
    case 'entrar':
      return { title: 'Ingresar', params: {} }
    case 'codigo':
      return { title: 'Canjear código', params: { from_link: second ? 'si' : 'no' } }
    case 'jugar':
      return { title: 'Juego libre', params: {} }
    case 'concurso':
      if (second && third) return { title: 'Jugando', params: { event_slug: second, game_slug: third } }
      return { title: 'Concurso', params: second ? { event_slug: second } : {} }
    case 'cuenta':
      return { title: 'Mi cuenta', params: {} }
    case 'pedidos':
      return { title: 'Pedidos', params: {} }
    case 'admin':
      return { title: second ? `Admin · ${second}` : 'Admin', params: {} }
    case 'sandbox':
      return { title: 'Sandbox', params: {} }
    default:
      return { title: 'No encontrada', params: {} }
  }
}
