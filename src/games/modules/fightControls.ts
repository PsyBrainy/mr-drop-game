import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../../fight/sim/input'

/**
 * El teclado. Lo comparten las dos vistas: en la local cada mitad del teclado
 * maneja a un peleador, y en la online el jugador usa siempre las teclas del
 * primero — cuál de los dos muñecos mueve lo decide el lugar que le dio el
 * servidor, no la tecla que aprieta.
 */

/**
 * Abajo (S / flecha abajo) es bajarse de las plataformas flotantes, así que el
 * esquive se corrió al lado de los golpes: F G H y , . / quedan en fila, una
 * tecla por acción.
 */
const P1 = {
  LEFT: 'KeyA', RIGHT: 'KeyD', JUMP: 'KeyW', DOWN: 'KeyS',
  LIGHT: 'KeyF', HEAVY: 'KeyG', DODGE: 'KeyH',
} as const

const P2 = {
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', JUMP: 'ArrowUp', DOWN: 'ArrowDown',
  LIGHT: 'Comma', HEAVY: 'Period', DODGE: 'Slash',
} as const

/**
 * El teclado se lee con listeners propios y no con `k.onKeyDown`: el input tiene
 * que ser el estado exacto en el momento del tick, y las teclas de Kaplay se
 * muestrean en su frame de render, que corre a otra frecuencia.
 */
export function listenKeyboard(inputs: [Input, Input]): () => void {
  const apply = (code: string, down: boolean): boolean => {
    const bind = (player: 0 | 1, button: number): boolean => {
      inputs[player] = down ? inputs[player] | button : inputs[player] & ~button
      return true
    }

    switch (code) {
      case P1.LEFT: return bind(0, LEFT)
      case P1.RIGHT: return bind(0, RIGHT)
      case P1.JUMP: return bind(0, JUMP)
      case P1.DOWN: return bind(0, DOWN)
      case P1.LIGHT: return bind(0, LIGHT)
      case P1.HEAVY: return bind(0, HEAVY)
      case P1.DODGE: return bind(0, DODGE)
      case P2.LEFT: return bind(1, LEFT)
      case P2.RIGHT: return bind(1, RIGHT)
      case P2.JUMP: return bind(1, JUMP)
      case P2.DOWN: return bind(1, DOWN)
      case P2.LIGHT: return bind(1, LIGHT)
      case P2.HEAVY: return bind(1, HEAVY)
      case P2.DODGE: return bind(1, DODGE)
      default: return false
    }
  }

  const down = (event: KeyboardEvent): void => {
    // `repeat` se ignora: el bit ya está prendido y el auto-repeat del sistema no
    // tiene nada que ver con los frames del juego.
    if (event.repeat) return
    if (apply(event.code, true)) event.preventDefault()
  }
  const up = (event: KeyboardEvent): void => {
    if (apply(event.code, false)) event.preventDefault()
  }
  /** Si la ventana pierde el foco con una tecla apretada, el bit quedaría trabado. */
  const clear = (): void => {
    inputs[0] = NONE
    inputs[1] = NONE
  }

  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)

  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
  }
}
