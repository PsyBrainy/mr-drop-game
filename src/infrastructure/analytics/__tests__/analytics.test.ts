import { describe, expect, it } from 'vitest'
import { describeClick } from '../autoTrack'
import { cleanParams, createGoogleAnalytics, MAX_VALUE, safePath } from '../googleAnalytics'
import { pageInfo } from '../../../ui/analytics/pageName'

describe('lo que nunca sale para Google', () => {
  it('el código de acceso de la ruta se tapa', () => {
    expect(safePath('/codigo/ABC-123')).toBe('/codigo/:codigo')
    expect(safePath('/codigo')).toBe('/codigo')
  })

  it('los códigos y tokens de la query se sacan, el resto queda', () => {
    expect(safePath('/codigo', '?c=ABC123')).toBe('/codigo')
    expect(safePath('/entrar', '?code=xyz&token_hash=t&type=signup&utm_source=ig')).toBe('/entrar?utm_source=ig')
    expect(safePath('/sandbox', '?juego=fight-online')).toBe('/sandbox?juego=fight-online')
  })

  it('un mail en un texto se reemplaza', () => {
    expect(cleanParams({ label: 'Escribime a martu@mail.com' })).toEqual({ label: 'Escribime a [mail]' })
  })
})

describe('los parámetros', () => {
  it('se sacan los vacíos y los números raros', () => {
    expect(cleanParams({ a: undefined, b: null, c: '  ', d: Number.NaN, e: 0, f: false })).toEqual({ e: 0, f: false })
  })

  it('los textos largos se cortan al largo que acepta GA', () => {
    const long = cleanParams({ texto: 'x'.repeat(300) })['texto'] as string
    expect(long.length).toBe(MAX_VALUE)
  })

  it('la lista de productos se limpia producto por producto', () => {
    expect(cleanParams({ items: [{ item_id: 'p1', item_name: '  Combo  ', price: 100 }] })).toEqual({
      items: [{ item_id: 'p1', item_name: 'Combo', price: 100 }],
    })
    expect(cleanParams({ items: [] })).toEqual({})
  })
})

describe('gtag', () => {
  function fake(debug = false) {
    const target: { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; location: { origin: string } } = {
      location: { origin: 'https://mrdrop.test' },
    }
    const scripts: string[] = []
    const analytics = createGoogleAnalytics({
      measurementId: 'G-TEST123',
      debug,
      target,
      loadScript: (src) => void scripts.push(src),
    })
    const calls = () => target.dataLayer!.map((entry) => Array.from(entry as ArrayLike<unknown>))
    return { analytics, scripts, calls }
  }

  it('carga el script de Google con el id de la variable, y sin página vista automática', () => {
    const { scripts, calls } = fake()
    expect(scripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST123'])
    expect(calls()[1]).toEqual(['config', 'G-TEST123', { send_page_view: false }])
  })

  it('cada página vista va con la dirección completa y el título', () => {
    const { analytics, calls } = fake()
    analytics.pageView('/jugar', 'Juego libre')
    expect(calls().at(-1)).toEqual([
      'event',
      'page_view',
      { page_location: 'https://mrdrop.test/jugar', page_path: '/jugar', page_title: 'Juego libre' },
    ])
  })

  it('el usuario va por su id, nunca por su nombre', () => {
    const { analytics, calls } = fake()
    analytics.identify('uuid-1', { is_admin: false })
    expect(calls().at(-2)).toEqual(['config', 'G-TEST123', { send_page_view: false, user_id: 'uuid-1' }])
    expect(calls().at(-1)).toEqual(['set', 'user_properties', { is_admin: false, logged_in: true }])
  })

  it('en modo debug cada evento se ve en DebugView', () => {
    const { analytics, calls } = fake(true)
    analytics.track('fight_end', { result: 'win' })
    expect(calls().at(-1)).toEqual(['event', 'fight_end', { result: 'win', debug_mode: true }])
  })
})

describe('los clicks', () => {
  /** Un elemento de mentira: lo justo que usa `describeClick`. */
  function element(tag: string, attrs: Record<string, string> = {}, text = '', parent: FakeElement | null = null): FakeElement {
    const node: FakeElement = {
      tagName: tag.toUpperCase(),
      textContent: text,
      value: attrs['value'] ?? '',
      type: attrs['type'] ?? '',
      name: attrs['name'] ?? '',
      getAttribute: (name) => attrs[name] ?? null,
      closest: (selector) => {
        for (let at: FakeElement | null = node; at; at = at.parent) {
          if (selector.startsWith('[data-analytics]') ? at.getAttribute('data-analytics') !== null : matches(at, selector)) return at
        }
        return null
      },
      parent,
    }
    return node
  }
  interface FakeElement {
    tagName: string
    textContent: string
    value: string
    type: string
    name: string
    getAttribute(name: string): string | null
    closest(selector: string): FakeElement | null
    parent: FakeElement | null
  }
  const matches = (el: FakeElement, selector: string) =>
    selector.split(',').some((part) => {
      const s = part.trim()
      if (s.startsWith('[role')) return el.getAttribute('role') === 'button'
      if (s.startsWith('input')) return el.tagName === 'INPUT'
      return el.tagName.toLowerCase() === s
    })
  const origin = 'https://mrdrop.test'
  const describe_ = (el: FakeElement) => describeClick(el as unknown as Element, origin)

  it('un botón se llama por su texto', () => {
    expect(describe_(element('button', {}, '  Buscar   rival '))).toEqual({ label: 'Buscar rival', element: 'button' })
  })

  it('un click adentro de un botón cuenta como el botón', () => {
    const button = element('button', { 'aria-label': 'Agregar uno' }, '+')
    const icon = element('span', {}, '+', button)
    expect(describe_(icon)?.label).toBe('Agregar uno')
  })

  it('un link se llama por su ruta, no por su texto (puede ser el nombre de alguien)', () => {
    expect(describe_(element('a', { href: '/cuenta' }, 'Martín'))).toEqual({
      label: '/cuenta',
      element: 'link',
      href: '/cuenta',
      outbound: false,
    })
  })

  it('un link afuera se marca como saliente', () => {
    expect(describe_(element('a', { href: 'https://wa.me/123?text=hola' }, 'WhatsApp'))).toMatchObject({
      href: 'https://wa.me/123',
      outbound: true,
    })
  })

  it('data-analytics le pone nombre, o lo apaga', () => {
    expect(describe_(element('button', { 'data-analytics': 'jugar_bot' }, 'Jugar'))?.label).toBe('jugar_bot')
    expect(describe_(element('button', { 'data-analytics': 'off' }, 'Secreto'))).toBeNull()
  })

  it('lo que no se clickea no se manda', () => {
    expect(describe_(element('div', {}, 'texto'))).toBeNull()
  })
})

describe('los nombres de las pantallas', () => {
  it('agrupan por tipo, con el concurso y el juego aparte', () => {
    expect(pageInfo('/')).toEqual({ title: 'Inicio', params: {} })
    expect(pageInfo('/concurso/verano')).toEqual({ title: 'Concurso', params: { event_slug: 'verano' } })
    expect(pageInfo('/concurso/verano/fight-online')).toEqual({
      title: 'Jugando',
      params: { event_slug: 'verano', game_slug: 'fight-online' },
    })
    expect(pageInfo('/codigo/ABC123')).toEqual({ title: 'Canjear código', params: { from_link: 'si' } })
    expect(pageInfo('/admin/pedidos').title).toBe('Admin · pedidos')
    expect(pageInfo('/cualquiera').title).toBe('No encontrada')
  })
})
