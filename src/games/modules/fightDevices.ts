import type { Input } from '../../fight/sim/input'
import { createGamepadInput } from './fightGamepad'
import { createControlsHelp, isTouchScreen, type ControlScheme, type ControlsHelp } from './fightHelp'
import { createTouchControls } from './fightTouch'
import { analytics } from '../../infrastructure/analytics'

/**
 * Todo lo que no es teclado, junto: los controles táctiles, los mandos y el
 * cartel de controles, que tiene que mostrar los de lo que se está usando.
 * Lo usan las dos vistas de la pelea (online y local).
 */
export interface FightDevices {
  /** Dedos + primer mando: el input del jugador de esta pantalla. */
  primary(): Input
  /** El segundo mando, para el jugador 2 de la pelea local. */
  secondPad(): Input
  readonly help: ControlsHelp
  destroy(): void
}

export function createFightDevices(mount: HTMLElement): FightDevices {
  const touch = createTouchControls(mount)
  const fallback = (): ControlScheme => (isTouchScreen() ? 'touch' : 'keyboard')
  const help = createControlsHelp(mount, fallback())

  const pads = createGamepadInput((count) => {
    // Con mando no hacen falta los botones en pantalla: tapan la pelea.
    touch.setHidden(count > 0)
    help.setScheme(count > 0 ? 'gamepad' : fallback())
    // Que se vea que lo reconoció, y cómo se juega con él.
    if (count > 0) help.show(4500)
    analytics.track(count > 0 ? 'gamepad_connected' : 'gamepad_disconnected', { count })
  })
  if (pads.count() > 0) {
    touch.setHidden(true)
    help.setScheme('gamepad')
  }

  // Con qué se juega: teclado, dedos o mando.
  analytics.track('fight_controls', { scheme: pads.count() > 0 ? 'gamepad' : fallback() })

  // Arranca abierto: la vista decide cuándo se cierra (cuando empieza la pelea).
  help.show()

  return {
    primary: () => touch.mask() | pads.mask(0),
    secondPad: () => pads.mask(1),
    help,
    destroy() {
      pads.destroy()
      touch.destroy()
      help.destroy()
    },
  }
}
