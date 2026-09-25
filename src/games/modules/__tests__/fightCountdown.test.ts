import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../fight/sim/tick'
import {
  COUNTDOWN_STEPS,
  countdownAt,
  createCountdown,
  GO_LABEL,
  GO_TICKS,
  HOLD_TICKS,
  SERVER_SILENCE_TIMEOUT_SECONDS,
  type CountdownFrame,
} from '../fightCountdown'

/** Corre la cuenta de punta a punta y junta qué carteles se vieron, en orden. */
function run(ticks: number): { shown: Array<string | null>; held: number } {
  const shown: Array<string | null> = []
  const countdown = createCountdown((frame: CountdownFrame | null) => shown.push(frame?.label ?? null))
  countdown.begin()
  let held = 0
  for (let i = 0; i < ticks; i += 1) if (countdown.tick()) held += 1
  return { shown, held }
}

describe('la cuenta del arranque', () => {
  it('dice 3, 2, 1 y ¡Buenos Humos!, en ese orden, y se va', () => {
    expect(run(HOLD_TICKS + GO_TICKS + 60).shown).toEqual([...COUNTDOWN_STEPS, GO_LABEL, null])
    expect(COUNTDOWN_STEPS).toEqual(['3', '2', '1'])
    expect(GO_LABEL).toBe('¡Buenos Humos!')
  })

  it('frena la pelea exactamente mientras cuenta, ni un tick más', () => {
    // La largada ya se juega: si "¡Buenos Humos!" también frenara, el que ve el
    // cartel apretaría y no pasaría nada.
    expect(run(HOLD_TICKS + GO_TICKS + 60).held).toBe(HOLD_TICKS)
    expect(countdownAt(HOLD_TICKS - 1)?.holds).toBe(true)
    expect(countdownAt(HOLD_TICKS)?.holds).toBe(false)
  })

  it('cada número dura un segundo', () => {
    COUNTDOWN_STEPS.forEach((label, i) => {
      expect(countdownAt(i * TICKS_PER_SECOND)?.label).toBe(label)
      expect(countdownAt((i + 1) * TICKS_PER_SECOND - 1)?.label).toBe(label)
    })
  })

  it('entra holgada en el tiempo que psy-ws espera antes de dar a alguien por ido', () => {
    // Contando no se manda nada. Si la cuenta se estirara hasta el timeout de
    // silencio, el servidor cortaría la partida por abandono antes del tick 0.
    // La mitad del timeout deja lugar para una pestaña lenta y el ping.
    expect(HOLD_TICKS / TICKS_PER_SECOND).toBeLessThanOrEqual(SERVER_SILENCE_TIMEOUT_SECONDS / 2)
  })

  it('no hace nada hasta que hay partida', () => {
    const shown: unknown[] = []
    const countdown = createCountdown((frame) => shown.push(frame))
    expect(countdown.started).toBe(false)
    expect(countdown.tick()).toBe(false)
    expect(shown).toEqual([])
  })

  it('arrancarla dos veces no la reinicia', () => {
    // La vista online llama a `begin()` en cada tick que hay partida.
    const countdown = createCountdown(() => {})
    countdown.begin()
    for (let i = 0; i < HOLD_TICKS - 1; i += 1) {
      countdown.tick()
      countdown.begin()
    }
    expect(countdown.tick()).toBe(true)
    expect(countdown.tick()).toBe(false)
  })

  it('avisa sólo cuando cambia el cartel', () => {
    // El DOM se escribe una vez por escalón, no 60 veces por segundo.
    expect(run(HOLD_TICKS + GO_TICKS + 600).shown).toHaveLength(COUNTDOWN_STEPS.length + 2)
  })
})
