import { resistanceOf, type Fighter, type PlayerIndex } from '../../fight/sim/state'
import type { MatchRules } from '../../fight/sim/world'
import { BOT_LEVEL_LABELS, BOT_LEVEL_ORDER, type BotLevel } from '../../fight/bot/bot'
import type { CountdownFrame } from './fightCountdown'

/**
 * El HUD de la pelea, en HTML encima del canvas (la regla del atlas de fuente de
 * `GameModule.ts` vale acá igual). No es React: la pelea lo arma adentro de su
 * propio `mountPoint` y lo actualiza escribiendo el DOM directo. Así los nombres
 * pueden seguir a los personajes cuadro a cuadro sin re-renderizar la página 60
 * veces por segundo.
 *
 * Arriba: un panel por jugador con el nombre, las vidas como corazones y la
 * resistencia como barra que cambia de color al bajar. Sobre cada personaje, su
 * nombre. Lo que se calcula (colores, corazones) son funciones puras exportadas,
 * que es lo que se prueba; el DOM es sólo dónde se escribe.
 */

/** Por encima de esto la barra está sana; por debajo de `CRITICAL` late. */
export const CRITICAL = 0.25

/**
 * Color de la barra según cuánto queda: verde lleno, amarillo a la mitad, rojo
 * vacío. Es un tono HSL y no tres colores fijos, así que la barra no salta de
 * color: se va poniendo roja de a poco a medida que te pegan.
 */
export function resistanceHue(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio))
  // La curva baja rápido del verde: a la mitad ya es amarillo (~57), a un
  // cuarto naranja (~25) y cerca de cero rojo. Es el tramo donde importa leer
  // cuánto falta para que el próximo fuerte te mande afuera.
  return Math.round(130 * Math.pow(clamped, 1.2))
}

export function resistanceColor(ratio: number): string {
  return `hsl(${resistanceHue(ratio)} 85% 52%)`
}

/** Corazones llenos y vacíos, en orden. */
export function heartsOf(stocks: number, max: number): boolean[] {
  return Array.from({ length: Math.max(max, 0) }, (_, i) => i < stocks)
}

export interface PlayerPanel {
  readonly stocks: number
  readonly maxStocks: number
  /** 0..1 */
  readonly resistance: number
  /** El valor que se muestra al lado de la barra. */
  readonly resistanceValue: number
}

/** Lo que muestra el panel de un peleador, leído del estado. Es una lectura: no entra al hash. */
export function panelOf(fighter: Fighter, rules: MatchRules): PlayerPanel {
  const value = resistanceOf(fighter, rules)
  return {
    stocks: fighter.state === 'dead' ? 0 : fighter.stocks,
    maxStocks: rules.stocks,
    resistance: value / rules.maxResistance,
    resistanceValue: value,
  }
}

/** Punto en coordenadas del canvas (VIEW), o `null` si no hay que mostrarlo. */
export type TagAnchor = { readonly x: number; readonly y: number } | null

export interface FightHud {
  setNames(names: readonly [string, string]): void
  /** Marca cuál es el jugador local (online): su nombre lleva "vos". */
  setLocal(index: PlayerIndex | null): void
  /**
   * Marca a quién maneja la máquina. Se tiene que ver siempre: nadie puede creer
   * que le ganó (o le perdió) a una persona cuando era el bot.
   */
  setBot(index: PlayerIndex | null): void
  /**
   * Muestra el cartel de "no hay rivales" con el botón para pelear contra la
   * máquina y la elección de dificultad (arranca en Fácil). `null` lo saca. Es
   * lo único del HUD que se puede tocar.
   */
  offerBot(onAccept: ((level: BotLevel) => void) | null): void
  update(panels: readonly [PlayerPanel, PlayerPanel]): void
  /** El contador de combo debajo del panel de cada uno ("3 golpes"), o nada. Sale de `fightCombo.ts`. */
  combo(labels: readonly [string | null, string | null]): void
  setStatus(text: string | null): void
  /** El cartel grande del arranque ("3, 2, 1, ¡Buenos Humos!"). `null` lo saca. */
  countdown(frame: CountdownFrame | null): void
  placeTags(anchors: readonly [TagAnchor, TagAnchor]): void
  destroy(): void
}

const HEART_SVG =
  '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21.3 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.3z"/></svg>'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  parent?.appendChild(node)
  return node
}

interface PanelNodes {
  root: HTMLDivElement
  name: HTMLSpanElement
  hearts: HTMLDivElement
  fill: HTMLDivElement
  trail: HTMLDivElement
  value: HTMLSpanElement
  combo: HTMLDivElement
  comboText: string | null
  last: PlayerPanel | null
}

export function createFightHud(mount: HTMLElement, view: { width: number; height: number }): FightHud {
  const root = el('div', 'fight-hud')
  root.setAttribute('aria-live', 'polite')
  mount.appendChild(root)

  const top = el('div', 'fight-hud__top', root)
  const badges: HTMLSpanElement[] = []
  const panels = ([0, 1] as const).map((index) => {
    const panelRoot = el('div', `fight-panel fight-panel--p${index + 1}`, top)
    const head = el('div', 'fight-panel__head', panelRoot)
    const badge = el('span', 'fight-panel__badge', head)
    badge.textContent = `P${index + 1}`
    badges[index] = badge
    const name = el('span', 'fight-panel__name', head)
    const hearts = el('div', 'fight-panel__hearts', head)
    const barRow = el('div', 'fight-panel__bar-row', panelRoot)
    const bar = el('div', 'fight-bar', barRow)
    const trail = el('div', 'fight-bar__trail', bar)
    const fill = el('div', 'fight-bar__fill', bar)
    el('div', 'fight-bar__ticks', bar)
    const value = el('span', 'fight-panel__value', barRow)
    const combo = el('div', 'fight-panel__combo', panelRoot)
    combo.hidden = true
    return { root: panelRoot, name, hearts, fill, trail, value, combo, comboText: null, last: null } as PanelNodes
  })
  // El estado va entre los dos paneles (buscando rival, esperando...).
  const status = el('div', 'fight-hud__status')
  top.insertBefore(status, panels[1]!.root)
  status.hidden = true

  const tags = ([0, 1] as const).map((index) => {
    const tag = el('div', `fight-tag fight-tag--p${index + 1}`, root)
    tag.hidden = true
    return tag
  })

  let local: PlayerIndex | null = null
  let bot: PlayerIndex | null = null

  // El cartel de "no hay rivales". Vive en el medio de la pantalla.
  const offer = el('div', 'fight-offer', root)
  offer.hidden = true
  const offerText = el('p', 'fight-offer__text', offer)
  offerText.textContent = 'No encontramos a nadie para pelear todavía.'
  const offerHint = el('p', 'fight-offer__hint', offer)
  offerHint.textContent = 'Seguimos buscando. Mientras tanto, podés pelear contra la máquina.'
  // La dificultad: tres botones tipo pestaña, Fácil marcado de entrada.
  const levels = el('div', 'fight-offer__levels', offer)
  levels.setAttribute('role', 'radiogroup')
  levels.setAttribute('aria-label', 'Dificultad')
  let chosen: BotLevel = 'easy'
  const levelButtons = BOT_LEVEL_ORDER.map((level) => {
    const button = el('button', 'fight-offer__level', levels)
    button.setAttribute('type', 'button')
    button.setAttribute('role', 'radio')
    button.dataset.level = level
    button.textContent = BOT_LEVEL_LABELS[level]
    button.addEventListener('click', (event) => {
      event.preventDefault()
      chosen = level
      paintLevels()
    })
    return button
  })
  const paintLevels = (): void => {
    for (const button of levelButtons) {
      const active = button.dataset.level === chosen
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-checked', String(active))
    }
  }
  paintLevels()
  const offerButton = el('button', 'fight-offer__btn', offer)
  offerButton.setAttribute('type', 'button')
  offerButton.textContent = 'Pelear contra la máquina'
  let onOffer: ((level: BotLevel) => void) | null = null
  const acceptOffer = (event: Event): void => {
    event.preventDefault()
    onOffer?.(chosen)
  }
  offerButton.addEventListener('click', acceptOffer)
  let names: readonly [string, string] = ['Jugador 1', 'Jugador 2']

  // La cuenta del arranque, al medio y arriba: más abajo la taparía el cartel
  // de controles, que justo en ese momento sigue abierto.
  const countdown = el('div', 'fight-countdown', root)
  countdown.hidden = true

  const paintNames = (): void => {
    ;([0, 1] as const).forEach((index) => {
      const panel = panels[index]!
      panel.name.textContent = names[index]
      const tag = tags[index]!
      tag.textContent = names[index]
      tag.classList.toggle('is-local', local === index)
      panel.root.classList.toggle('is-local', local === index)
      tag.classList.toggle('is-bot', bot === index)
      panel.root.classList.toggle('is-bot', bot === index)
      badges[index]!.textContent = bot === index ? 'BOT' : `P${index + 1}`
    })
  }
  paintNames()

  const paintPanel = (panel: PanelNodes, data: PlayerPanel): void => {
    const last = panel.last
    if (!last || last.stocks !== data.stocks || last.maxStocks !== data.maxStocks) {
      const lostOne = last !== null && data.stocks < last.stocks
      panel.hearts.replaceChildren(
        ...heartsOf(data.stocks, data.maxStocks).map((full, i) => {
          const heart = el('span', `fight-heart ${full ? 'is-full' : 'is-empty'}`)
          if (lostOne && i === data.stocks) heart.classList.add('is-lost')
          heart.innerHTML = HEART_SVG
          return heart
        }),
      )
      panel.hearts.setAttribute('aria-label', `${data.stocks} de ${data.maxStocks} vidas`)
    }
    if (!last || last.resistance !== data.resistance) {
      const pct = `${(data.resistance * 100).toFixed(1)}%`
      panel.fill.style.width = pct
      panel.trail.style.width = pct
      panel.root.style.setProperty('--bar-color', resistanceColor(data.resistance))
      panel.root.classList.toggle('is-critical', data.resistance > 0 && data.resistance <= CRITICAL)
      panel.root.classList.toggle('is-empty', data.resistance <= 0)
      // Un golpe hace temblar el panel: se sabe quién comió sin mirar la barra.
      if (last && data.resistance < last.resistance) {
        panel.root.classList.remove('is-hit')
        void panel.root.offsetWidth
        panel.root.classList.add('is-hit')
      }
    }
    if (!last || last.resistanceValue !== data.resistanceValue) {
      panel.value.textContent = String(data.resistanceValue)
    }
    panel.last = data
  }

  return {
    setNames(next) {
      names = next
      paintNames()
    },
    setLocal(index) {
      local = index
      paintNames()
    },
    setBot(index) {
      bot = index
      paintNames()
    },
    offerBot(accept) {
      onOffer = accept
      if (accept && offer.hidden) {
        chosen = 'easy'
        paintLevels()
      }
      offer.hidden = accept === null
    },
    update(data) {
      paintPanel(panels[0]!, data[0])
      paintPanel(panels[1]!, data[1])
    },
    combo(labels) {
      labels.forEach((text, index) => {
        const panel = panels[index]!
        if (text === panel.comboText) return
        panel.comboText = text
        panel.combo.hidden = text === null
        panel.combo.textContent = text ?? ''
        // Cada golpe nuevo del combo hace saltar el número (como el temblor del panel).
        if (text !== null) {
          panel.combo.classList.remove('is-bump')
          void panel.combo.offsetWidth
          panel.combo.classList.add('is-bump')
        }
      })
    },
    setStatus(text) {
      status.hidden = text === null
      status.textContent = text ?? ''
    },
    countdown(frame) {
      if (!frame) {
        countdown.hidden = true
        countdown.textContent = ''
        return
      }
      countdown.hidden = false
      countdown.textContent = frame.label
      countdown.classList.toggle('is-go', !frame.holds)
      // Se reinicia la animación en cada escalón: sacar la clase, forzar un
      // layout y volver a ponerla (igual que el temblor del panel).
      countdown.classList.remove('is-step')
      void countdown.offsetWidth
      countdown.classList.add('is-step')
    },
    placeTags(anchors) {
      anchors.forEach((anchor, index) => {
        const tag = tags[index]!
        if (!anchor) {
          tag.hidden = true
          return
        }
        tag.hidden = false
        // En porcentaje del marco: el canvas se estira al marco con la misma
        // proporción, así que el punto cae igual en cualquier tamaño.
        tag.style.left = `${(anchor.x / view.width) * 100}%`
        tag.style.top = `${(anchor.y / view.height) * 100}%`
      })
    },
    destroy() {
      offerButton.removeEventListener('click', acceptOffer)
      root.remove()
    },
  }
}
