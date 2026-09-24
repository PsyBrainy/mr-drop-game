import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../../fight/sim/input'

/**
 * Mandos (joysticks) con la Gamepad API del navegador: Xbox, PlayStation y
 * genéricos, por USB o Bluetooth, en la PC y en el celular.
 *
 * Igual que el teclado y los dedos, un mando termina siendo el mismo byte de
 * input: la vista lo junta con un OR y la sim, la red y los replays no se
 * enteran de con qué se jugó.
 *
 * La Gamepad API no avisa cuando se aprieta un botón: hay que preguntar el
 * estado. Se pregunta en cada tick del juego, que es justo cuando hace falta.
 */

/** Lo que se lee de un mando. Es un recorte de `Gamepad`, para poder probarlo. */
export interface PadState {
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>
  readonly axes: readonly number[]
}

/** Cuánto hay que inclinar el stick para caminar: los sticks gastados no vuelven al 0. */
export const PAD_DEADZONE = 0.35
/** Para bajarse de una flotante hay que empujar más: caminar con el stick torcido no tiene que tirarte. */
export const PAD_DOWN = 0.6

/**
 * Los botones en la distribución estándar ("standard mapping") de la Gamepad
 * API, que es la misma en Xbox y PlayStation: 0 abajo (A / ✕), 1 derecha
 * (B / ◯), 2 izquierda (X / ▢), 3 arriba (Y / △), 4 y 5 los hombros (LB/RB,
 * L1/R1), 12–15 la cruz.
 */
export const PAD_BUTTONS: ReadonlyArray<{ readonly index: number; readonly bit: Input }> = [
  { index: 0, bit: JUMP }, // A / ✕
  { index: 2, bit: LIGHT }, // X / ▢
  { index: 3, bit: HEAVY }, // Y / △
  { index: 1, bit: HEAVY }, // B / ◯
  { index: 4, bit: DODGE }, // LB / L1
  { index: 5, bit: DODGE }, // RB / R1
  { index: 13, bit: DOWN }, // cruz abajo
  { index: 14, bit: LEFT }, // cruz izquierda
  { index: 15, bit: RIGHT }, // cruz derecha
]

/** El input de un mando en este momento. Stick izquierdo y cruz hacen lo mismo. */
export function readPad(pad: PadState): Input {
  let input: Input = NONE
  for (const { index, bit } of PAD_BUTTONS) {
    if (pad.buttons[index]?.pressed) input |= bit
  }
  const x = pad.axes[0] ?? 0
  const y = pad.axes[1] ?? 0
  if (x <= -PAD_DEADZONE) input |= LEFT
  if (x >= PAD_DEADZONE) input |= RIGHT
  if (y >= PAD_DOWN) input |= DOWN
  // Izquierda y derecha a la vez (cruz y stick para lados distintos) no es
  // ninguna de las dos.
  if ((input & (LEFT | RIGHT)) === (LEFT | RIGHT)) input &= ~(LEFT | RIGHT)
  return input
}

export interface GamepadInput {
  /** El input del mando número `slot` (0 el primero conectado, 1 el segundo). */
  mask(slot?: number): Input
  /** Cuántos mandos hay conectados. */
  count(): number
  destroy(): void
}

/**
 * Escucha los mandos. `onChange` avisa cuando se conecta o se desconecta uno,
 * con cuántos quedan: la vista lo usa para esconder los controles táctiles y
 * mostrar los del mando.
 *
 * Ojo con una regla de los navegadores: un mando recién "aparece" cuando se
 * aprieta algún botón con la página abierta. Antes de eso no hay forma de
 * saber que está ahí.
 */
export function createGamepadInput(onChange?: (count: number) => void): GamepadInput {
  const pads = (): PadState[] => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return []
    return Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => pad !== null && pad.connected)
  }

  let known = pads().length
  // Algunos navegadores no disparan los eventos y el mando aparece solo en la
  // lista: por eso también se compara la cantidad en cada lectura.
  const check = (): void => {
    const now = pads().length
    if (now === known) return
    known = now
    onChange?.(now)
  }

  window.addEventListener('gamepadconnected', check)
  window.addEventListener('gamepaddisconnected', check)

  return {
    mask(slot = 0) {
      const list = pads()
      if (list.length !== known) check()
      const pad = list[slot]
      return pad ? readPad(pad) : NONE
    },
    count: () => known,
    destroy() {
      window.removeEventListener('gamepadconnected', check)
      window.removeEventListener('gamepaddisconnected', check)
    },
  }
}
