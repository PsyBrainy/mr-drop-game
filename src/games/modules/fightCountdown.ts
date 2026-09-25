import { TICKS_PER_SECOND } from '../../fight/sim/tick'

/**
 * La cuenta regresiva del arranque: "3, 2, 1, ¡Buenos Humos!". Está para que el
 * que entra tenga tiempo de acomodarse — encontrar el teclado, agarrar el mando,
 * mirar quién es quién — antes de que le lleguen los golpes.
 *
 * **No es parte de la sim, y es a propósito.** La cuenta pasa *antes* del tick
 * 0: mientras dura, la partida no arrancó, así que no hay inputs que ignorar ni
 * nada que el validador tenga que re-jugar. Meterla adentro de `step()` (tantos
 * ticks sin control) habría cambiado el resultado de los mismos inputs, que es
 * subir `SIM_VERSION` y desplegar juntos la web, psy-ws y el validador — y las
 * partidas pendientes de la versión anterior dejarían de validarse.
 *
 * Que sea de la vista no la hace trampeable: un cliente que se saltee la cuenta
 * arranca el tick 0 antes, pero la sesión es delay-based y se frena esperando el
 * input del rival, que todavía está contando. No se adelanta nada; se traba.
 * Los dos navegadores reciben `match` casi a la vez, así que la diferencia es lo
 * que tarde uno más que el otro en recibirlo, y la absorbe la misma espera.
 *
 * Se cuenta en ticks del reloj fijo y no en milisegundos: con la pestaña de
 * fondo el reloj se frena, y la cuenta se frena con él en vez de terminar sola
 * sin que nadie la vea.
 */

/** Lo que se muestra en cada escalón, en orden. El último es la largada. */
export const COUNTDOWN_STEPS = ['3', '2', '1'] as const
export const GO_LABEL = '¡Buenos Humos!'

/** Un segundo por número: el ritmo en que la gente cuenta en voz alta. */
export const STEP_TICKS = TICKS_PER_SECOND

/** Cuánto se frena la partida. Después de esto, la pelea corre. */
export const HOLD_TICKS = COUNTDOWN_STEPS.length * STEP_TICKS

/**
 * Cuánto queda el "¡Buenos Humos!" en pantalla con la pelea ya andando. Menos
 * de un segundo: tapa el medio del escenario, justo donde se cruzan los dos.
 */
export const GO_TICKS = Math.round(TICKS_PER_SECOND * 0.8)

/**
 * Cuánto aguanta psy-ws a un jugador sin mandar nada antes de darlo por ido
 * (`fight.silence-timeout-seconds`, 10 por defecto). Durante la cuenta el
 * cliente no manda inputs: la cuenta entera tiene que caber holgada acá adentro,
 * o el que se toma su tiempo pierde por abandono antes de empezar.
 */
export const SERVER_SILENCE_TIMEOUT_SECONDS = 10

export interface CountdownFrame {
  readonly label: string
  /** Si la partida tiene que seguir frenada. En la largada ya no. */
  readonly holds: boolean
  /**
   * Número de escalón. Cambia cuando cambia el cartel: la vista lo usa para
   * reiniciar la animación, aunque dos escalones seguidos dijeran lo mismo.
   */
  readonly step: number
}

/**
 * Qué mostrar después de `ticks` ticks de cuenta. `null` es que ya terminó (o
 * que todavía no empezó: los ticks negativos no existen, pero no se inventan).
 */
export function countdownAt(ticks: number): CountdownFrame | null {
  if (ticks < 0) return null
  if (ticks < HOLD_TICKS) {
    const step = Math.floor(ticks / STEP_TICKS)
    return { label: COUNTDOWN_STEPS[step]!, holds: true, step }
  }
  if (ticks < HOLD_TICKS + GO_TICKS) {
    return { label: GO_LABEL, holds: false, step: COUNTDOWN_STEPS.length }
  }
  return null
}

/**
 * La cuenta de una partida. Se prende con `begin()` cuando hay partida (rival
 * encontrado, o el bot) y se consulta una vez por tick del reloj: `tick()` avanza
 * y dice si la pelea tiene que seguir frenada. `onChange` recibe el cartel sólo
 * cuando cambia, así el DOM no se escribe 60 veces por segundo.
 */
export interface Countdown {
  begin(): void
  tick(): boolean
  readonly started: boolean
}

export function createCountdown(onChange: (frame: CountdownFrame | null) => void): Countdown {
  let elapsed: number | null = null
  let shown: number | null = null

  return {
    get started() {
      return elapsed !== null
    },
    begin() {
      if (elapsed !== null) return
      elapsed = 0
    },
    tick() {
      if (elapsed === null) return false
      const frame = countdownAt(elapsed)
      elapsed += 1
      const step = frame?.step ?? null
      if (step !== shown) {
        shown = step
        onChange(frame)
      }
      return frame?.holds ?? false
    },
  }
}
