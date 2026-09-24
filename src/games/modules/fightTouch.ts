import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../../fight/sim/input'

/**
 * Los controles en pantalla para jugar con el dedo. A la izquierda un stick para
 * moverse, que sólo se ve mientras se lo usa; a la derecha cuatro botones
 * chicos en rombo: saltar, los dos golpes y el esquive.
 *
 * Son HTML encima del canvas, como el HUD, y sólo aparecen en pantallas táctiles
 * (lo decide el CSS con `pointer: coarse`, no este archivo). Escriben su propio
 * bitmask y la vista lo junta con el del teclado con un OR: para la simulación,
 * un dedo en la pantalla y una tecla son exactamente el mismo byte, así que nada
 * cambia en la sim, en la red ni en los replays.
 *
 * Multitouch de verdad: cada dedo lleva la cuenta de qué bits marca (por
 * `pointerId`), así se puede caminar y pegar a la vez, y soltar un dedo no suelta
 * lo que sigue apretado con otro.
 */

/**
 * Qué tan lejos del centro tiene que ir la palanca para caminar, como fracción
 * del radio. Por debajo no mueve: apoyar el pulgar para descansar no tiene que
 * hacer caminar al personaje.
 */
export const STICK_DEADZONE = 0.3

/**
 * Cuánto hay que empujar para abajo para bajarse de una flotante, como fracción
 * del radio. Más que la zona muerta de los costados a propósito: caminar con el
 * pulgar un poco torcido no tiene que tirarte de la plataforma.
 */
export const STICK_DOWN = 0.55

export interface StickReading {
  /** Dónde se dibuja la palanca, relativo al centro y ya limitado al radio. */
  readonly knobX: number
  readonly knobY: number
  readonly input: Input
}

/**
 * Lee el stick: desplazamiento del dedo respecto del centro, en px (la y crece
 * hacia abajo, como en la pantalla). Los costados caminan y abajo baja de una
 * plataforma flotante; arriba no hace nada: saltar es un botón, así caminar
 * con el pulgar torcido nunca salta sin querer. La palanca no se sale del aro
 * aunque el dedo sí.
 */
export function readStick(dx: number, dy: number, radius: number): StickReading {
  const distance = Math.sqrt(dx * dx + dy * dy)
  const scale = distance > radius && distance > 0 ? radius / distance : 1
  const knobX = dx * scale
  const knobY = dy * scale
  const pushX = radius > 0 ? knobX / radius : 0
  const pushY = radius > 0 ? knobY / radius : 0
  let input: Input = pushX <= -STICK_DEADZONE ? LEFT : pushX >= STICK_DEADZONE ? RIGHT : NONE
  if (pushY >= STICK_DOWN) input |= DOWN
  return { knobX, knobY, input }
}

export interface TouchButtonSpec {
  readonly bit: Input
  readonly label: string
  readonly className: string
}

/**
 * Los botones de la derecha, en rombo como un control de consola: saltar abajo
 * (donde descansa el pulgar), el golpe rápido a la izquierda, el fuerte arriba
 * y el esquive a la derecha. Para el doble salto se suelta y se vuelve a
 * apretar, igual que la tecla: la sim salta cuando el bit se prende.
 */
export const ACTION_BUTTONS: readonly TouchButtonSpec[] = [
  { bit: JUMP, label: 'Salto', className: 'is-jump' },
  { bit: LIGHT, label: 'Rápido', className: 'is-light' },
  { bit: HEAVY, label: 'Fuerte', className: 'is-heavy' },
  { bit: DODGE, label: 'Esquive', className: 'is-dodge' },
]

export interface TouchControls {
  /** El input que marcan los dedos en este momento. */
  mask(): Input
  destroy(): void
}

function el(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  parent?.appendChild(node)
  return node
}

export function createTouchControls(mount: HTMLElement): TouchControls {
  const root = el('div', 'fight-touch')
  root.setAttribute('aria-hidden', 'true')
  mount.appendChild(root)

  // Cada dedo aporta los bits que marca; el input es el OR de todos.
  const fingers = new Map<number, Input>()
  const mask = (): Input => {
    let value = NONE
    fingers.forEach((bits) => {
      value |= bits
    })
    return value
  }

  const cleanups: Array<() => void> = []
  const on = <K extends keyof HTMLElementEventMap>(
    node: HTMLElement | Window,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ): void => {
    node.addEventListener(type, handler as EventListener, { passive: false })
    cleanups.push(() => node.removeEventListener(type, handler as EventListener))
  }

  // --- stick (izquierda) ----------------------------------------------------
  // La zona es más grande que el aro y no se ve: donde apoyes el pulgar en la
  // mitad izquierda de abajo, ahí aparece el stick, y al soltar desaparece. Así
  // no tapa la pelea y no hace falta embocarle a un círculo sin mirar.
  const zone = el('div', 'fight-touch__zone', root)
  const stick = el('div', 'fight-touch__stick', zone)
  el('span', 'fight-touch__drop', stick).textContent = '▼'
  const knob = el('div', 'fight-touch__knob', stick)
  let stickFinger: number | null = null
  let center = { x: 0, y: 0 }

  const placeStick = (x: number | null, y: number | null): void => {
    if (x === null || y === null) {
      // Se esconde hasta el próximo toque.
      stick.style.left = ''
      stick.style.top = ''
      stick.classList.remove('is-active')
      return
    }
    const rect = zone.getBoundingClientRect()
    stick.style.left = `${x - rect.left}px`
    stick.style.top = `${y - rect.top}px`
    stick.classList.add('is-active')
  }

  const moveKnob = (event: PointerEvent): void => {
    const radius = stick.getBoundingClientRect().width / 2
    const reading = readStick(event.clientX - center.x, event.clientY - center.y, radius)
    knob.style.transform = `translate(calc(-50% + ${reading.knobX}px), calc(-50% + ${reading.knobY}px))`
    fingers.set(event.pointerId, reading.input)
    refresh()
  }

  const endStick = (event: PointerEvent): void => {
    if (event.pointerId !== stickFinger) return
    stickFinger = null
    fingers.delete(event.pointerId)
    knob.style.transform = ''
    placeStick(null, null)
    refresh()
  }

  on(zone, 'pointerdown', (event) => {
    event.preventDefault()
    if (stickFinger !== null) return
    stickFinger = event.pointerId
    // La captura hace que el dedo siga siendo del stick aunque salga de la zona.
    zone.setPointerCapture(event.pointerId)
    center = { x: event.clientX, y: event.clientY }
    placeStick(event.clientX, event.clientY)
    moveKnob(event)
  })
  on(zone, 'pointermove', (event) => {
    if (event.pointerId === stickFinger) moveKnob(event)
  })
  on(zone, 'pointerup', endStick)
  on(zone, 'pointercancel', endStick)

  // --- botones de acción (derecha) --------------------------------------------
  const actions = el('div', 'fight-touch__actions', root)
  const release = (event: PointerEvent): void => {
    fingers.delete(event.pointerId)
    refresh()
  }
  const buttons = ACTION_BUTTONS.map((spec) => {
    const button = el('span', `fight-touch__btn ${spec.className}`, actions)
    button.textContent = spec.label
    on(button, 'pointerdown', (event) => {
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      fingers.set(event.pointerId, spec.bit)
      refresh()
    })
    on(button, 'pointerup', release)
    on(button, 'pointercancel', release)
    return { spec, button }
  })

  // Nada de menú contextual ni lupa al mantener apretado.
  on(root, 'contextmenu', (event) => event.preventDefault())

  // Se ilumina lo que está apretado: sin vibración ni sonido, es la única
  // confirmación de que el toque llegó.
  function refresh(): void {
    const current = mask()
    stick.classList.toggle('is-left', (current & LEFT) !== 0)
    stick.classList.toggle('is-right', (current & RIGHT) !== 0)
    stick.classList.toggle('is-drop', (current & DOWN) !== 0)
    for (const { spec, button } of buttons) button.classList.toggle('is-down', (current & spec.bit) !== 0)
  }

  // Si la ventana pierde el foco con un dedo apoyado, el bit quedaría trabado.
  const clear = (): void => {
    fingers.clear()
    stickFinger = null
    knob.style.transform = ''
    placeStick(null, null)
    refresh()
  }
  on(window, 'blur', clear)

  return {
    mask,
    destroy() {
      cleanups.forEach((off) => off())
      root.remove()
    },
  }
}
