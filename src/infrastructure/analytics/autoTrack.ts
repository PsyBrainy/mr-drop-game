/**
 * Lo que se trackea solo, sin tocar cada botón: todos los clicks en botones y
 * links, los formularios que se mandan, y los errores de JavaScript.
 *
 * Un solo listener en el documento (delegación): funciona con lo que React
 * pinte después, y no hay que acordarse de agregar nada al hacer un botón
 * nuevo. Para ponerle otro nombre a algo, `data-analytics="nombre"`; para que
 * no se mande, `data-analytics="off"`.
 */

import type { Analytics } from './googleAnalytics'

const CLICKABLE = 'a, button, [role="button"], summary, input[type="submit"], input[type="button"], input[type="checkbox"]'

export interface ClickInfo {
  readonly label: string
  readonly element: string
  readonly href?: string
  readonly outbound?: boolean
}

function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Cómo se llama lo que se clickeó. En un link manda la ruta y no el texto: el
 * texto de un link puede ser el nombre de la persona (el de "Mi cuenta" lo es),
 * y a GA no se le mandan nombres.
 */
export function describeClick(target: Element, origin: string): ClickInfo | null {
  const element = target.closest(CLICKABLE)
  if (!element) return null
  const tagged = element.closest('[data-analytics]')?.getAttribute('data-analytics')
  if (tagged === 'off') return null

  const tag = element.tagName.toLowerCase()
  if (tag === 'a') {
    const raw = element.getAttribute('href') ?? ''
    let href = raw
    let outbound = false
    try {
      const url = new URL(raw, origin)
      outbound = url.origin !== origin
      href = outbound ? `${url.origin}${url.pathname}` : url.pathname
    } catch {
      // un href raro: se manda tal cual
    }
    const label = tagged || element.getAttribute('aria-label') || href
    return { label: collapse(label), element: 'link', href, outbound }
  }

  const input = element as HTMLInputElement
  const label =
    tagged ||
    element.getAttribute('aria-label') ||
    (tag === 'input' ? input.value || input.name : collapse(element.textContent)) ||
    element.getAttribute('title') ||
    tag
  const kind = tag === 'input' ? `input_${input.type}` : tag === 'summary' ? 'desplegable' : 'button'
  return { label: collapse(label), element: kind }
}

export function installAutoTracking(analytics: Analytics, doc: Document, win: Window): () => void {
  if (!analytics.enabled) return () => {}

  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return
    const info = describeClick(event.target, win.location.origin)
    if (!info) return
    analytics.track('ui_click', {
      click_label: info.label,
      click_element: info.element,
      link_url: info.href,
      outbound: info.outbound,
      page_path: win.location.pathname.replace(/^\/codigo\/[^/]+/i, '/codigo/:codigo'),
    })
  }

  const onSubmit = (event: SubmitEvent): void => {
    const form = event.target instanceof HTMLFormElement ? event.target : null
    if (!form || form.closest('[data-analytics="off"]')) return
    const button = event.submitter ?? form.querySelector('[type="submit"]')
    analytics.track('form_submit', {
      form_label: form.getAttribute('data-analytics') || collapse(button?.textContent) || form.id || 'formulario',
      page_path: win.location.pathname.replace(/^\/codigo\/[^/]+/i, '/codigo/:codigo'),
    })
  }

  const onError = (event: ErrorEvent): void => {
    analytics.track('exception', {
      description: `${event.message} @ ${event.filename?.split('/').pop() ?? '?'}:${event.lineno ?? 0}`,
      fatal: false,
    })
  }

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    analytics.track('exception', { description: `promesa: ${reason}`, fatal: false })
  }

  doc.addEventListener('click', onClick, { capture: true })
  doc.addEventListener('submit', onSubmit, { capture: true })
  win.addEventListener('error', onError)
  win.addEventListener('unhandledrejection', onRejection)

  return () => {
    doc.removeEventListener('click', onClick, { capture: true })
    doc.removeEventListener('submit', onSubmit, { capture: true })
    win.removeEventListener('error', onError)
    win.removeEventListener('unhandledrejection', onRejection)
  }
}
