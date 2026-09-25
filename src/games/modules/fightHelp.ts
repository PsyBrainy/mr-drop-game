/**
 * El cartel de controles. Aparece al entrar a la pelea con los controles de lo
 * que el jugador está usando (teclado, pantalla táctil o mando), se va solo
 * unos segundos después de que arranca la pelea, y se vuelve a abrir con el
 * botón "Controles".
 *
 * Es HTML encima del canvas, como el HUD. Los datos están separados del DOM
 * (`CONTROL_HELP`) para poder probarlos y para que no se desincronicen de las
 * teclas de verdad: las teclas salen de `P1_KEYS`.
 */

import { P1_KEYS } from './fightControls'

export type ControlScheme = 'keyboard' | 'touch' | 'gamepad'

export interface HelpRow {
  /** Lo que se aprieta, como etiquetas cortas ("←", "Z", "A / ✕"). */
  readonly keys: readonly string[]
  readonly action: string
}

/** Cómo se muestra una tecla: el código del navegador pasado a algo legible. */
export function keyLabel(code: string): string {
  const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }
  if (arrows[code]) return arrows[code]!
  if (code.startsWith('Key')) return code.slice(3)
  return code
}

export const SCHEME_TITLES: Record<ControlScheme, string> = {
  keyboard: 'Teclado',
  touch: 'Pantalla táctil',
  gamepad: 'Mando',
}

export const CONTROL_HELP: Record<ControlScheme, readonly HelpRow[]> = {
  keyboard: [
    { keys: [keyLabel(P1_KEYS.LEFT), keyLabel(P1_KEYS.RIGHT)], action: 'Moverse' },
    { keys: [keyLabel(P1_KEYS.JUMP)], action: 'Saltar (dos veces en el aire)' },
    { keys: [keyLabel(P1_KEYS.DOWN)], action: 'Bajarse de una plataforma' },
    { keys: [keyLabel(P1_KEYS.LIGHT)], action: 'Golpe rápido' },
    { keys: [keyLabel(P1_KEYS.HEAVY)], action: 'Golpe fuerte' },
    {
      keys: [`${keyLabel(P1_KEYS.LIGHT)}/${keyLabel(P1_KEYS.HEAVY)}`, `+ ${keyLabel(P1_KEYS.LEFT)}${keyLabel(P1_KEYS.RIGHT)} ${keyLabel(P1_KEYS.DOWN)}`],
      action: 'Cada dirección es otro golpe (abajo en el aire: pisotón)',
    },
    { keys: [`${keyLabel(P1_KEYS.HEAVY)} en el aire`], action: 'Recovery: te impulsa para arriba' },
    { keys: [keyLabel(P1_KEYS.DODGE)], action: 'Esquive' },
    {
      keys: [`${keyLabel(P1_KEYS.DODGE)} quieto en el aire`, `+ ${keyLabel(P1_KEYS.LIGHT)}/${keyLabel(P1_KEYS.HEAVY)}`],
      action: 'Gravity cancel: golpe de piso en el aire',
    },
  ],
  touch: [
    { keys: ['Stick'], action: 'Tocá y arrastrá a la izquierda para moverte' },
    { keys: ['Stick ↓'], action: 'Bajarse de una plataforma' },
    { keys: ['Salto'], action: 'Saltar (dos veces en el aire)' },
    { keys: ['Rápido', 'Fuerte'], action: 'Los golpes' },
    { keys: ['Stick', '+ golpe'], action: 'Cada dirección es otro golpe (abajo en el aire: pisotón)' },
    { keys: ['Fuerte en el aire'], action: 'Recovery: te impulsa para arriba' },
    { keys: ['Esquive'], action: 'Esquivar un golpe' },
    { keys: ['Esquive quieto en el aire', '+ golpe'], action: 'Gravity cancel: golpe de piso en el aire' },
  ],
  gamepad: [
    { keys: ['Stick', 'Cruz'], action: 'Moverse' },
    { keys: ['A / ✕'], action: 'Saltar (dos veces en el aire)' },
    { keys: ['↓'], action: 'Bajarse de una plataforma' },
    { keys: ['X / ▢'], action: 'Golpe rápido' },
    { keys: ['Y / △', 'B / ◯'], action: 'Golpe fuerte' },
    { keys: ['Stick', '+ golpe'], action: 'Cada dirección es otro golpe (abajo en el aire: pisotón)' },
    { keys: ['Fuerte en el aire'], action: 'Recovery: te impulsa para arriba' },
    { keys: ['LB / RB'], action: 'Esquive' },
    { keys: ['LB / RB quieto en el aire', '+ golpe'], action: 'Gravity cancel: golpe de piso en el aire' },
  ],
}

/** Consejo de abajo del cartel: lo que no es un botón pero hay que saber. */
export const HELP_TIP =
  'Combo: barrida (rápido + abajo), saltá hacia el rival y rápido de costado. Al costado de la plataforma te podés colgar.'

/** ¿Pantalla táctil sin mouse? Es lo mismo que decide el CSS para mostrar los controles. */
export function isTouchScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true
}

export interface ControlsHelp {
  /** Cambia a los controles de otro dispositivo (se enchufó un mando, por ejemplo). */
  setScheme(scheme: ControlScheme): void
  /** Lo abre. Con `ms`, se cierra solo después de ese tiempo. */
  show(ms?: number): void
  /** Se cierra solo en `ms`, salvo que el jugador lo haya abierto a mano. */
  hideIn(ms: number): void
  hide(): void
  destroy(): void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  parent?.appendChild(node)
  return node
}

export function createControlsHelp(mount: HTMLElement, initial: ControlScheme): ControlsHelp {
  const root = el('div', 'fight-help')
  mount.appendChild(root)

  const toggle = el('button', 'fight-help__toggle', root)
  toggle.type = 'button'
  toggle.textContent = '? Controles'

  const card = el('div', 'fight-help__card', root)
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', 'Controles')
  const title = el('div', 'fight-help__title', card)
  const list = el('ul', 'fight-help__list', card)
  const tip = el('p', 'fight-help__tip', card)
  tip.textContent = HELP_TIP
  const close = el('p', 'fight-help__close', card)
  close.textContent = 'Tocá el cartel para cerrarlo'

  let scheme = initial
  let timer: ReturnType<typeof setTimeout> | null = null
  /** Si lo abrió el jugador, se queda abierto hasta que lo cierre. */
  let pinned = false

  const paint = (): void => {
    title.textContent = `Controles · ${SCHEME_TITLES[scheme]}`
    list.replaceChildren()
    for (const row of CONTROL_HELP[scheme]) {
      const item = el('li', 'fight-help__row', list)
      const keys = el('span', 'fight-help__keys', item)
      for (const key of row.keys) el('kbd', 'fight-help__key', keys).textContent = key
      el('span', 'fight-help__action', item).textContent = row.action
    }
    root.dataset.scheme = scheme
  }

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const setOpen = (open: boolean): void => {
    root.classList.toggle('is-open', open)
    if (!open) pinned = false
  }

  // Con el mouse, que el botón no se quede con el foco: las flechas y la barra
  // tienen que seguir yendo al juego.
  toggle.addEventListener('mousedown', (event) => event.preventDefault())
  toggle.addEventListener('click', () => {
    clearTimer()
    pinned = true
    setOpen(true)
  })
  card.addEventListener('click', () => {
    clearTimer()
    setOpen(false)
  })

  paint()

  return {
    setScheme(next) {
      if (next === scheme) return
      scheme = next
      paint()
    },
    show(ms) {
      clearTimer()
      setOpen(true)
      if (ms !== undefined) timer = setTimeout(() => setOpen(false), ms)
    },
    hideIn(ms) {
      if (pinned || !root.classList.contains('is-open')) return
      clearTimer()
      timer = setTimeout(() => setOpen(false), ms)
    },
    hide() {
      clearTimer()
      setOpen(false)
    },
    destroy() {
      clearTimer()
      root.remove()
    },
  }
}
