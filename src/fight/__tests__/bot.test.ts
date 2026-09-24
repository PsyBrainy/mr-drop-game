import { describe, expect, it } from 'vitest'
import { botStep, createBot, type Bot, type BotLevel } from '../bot/bot'
import { SMALL_STAGE } from '../data/stage'
import { fx } from '../sim/fixed'
import { NONE, type Input } from '../sim/input'
import { initialState, type MatchState } from '../sim/state'
import { step, TICKS_PER_SECOND } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * El bot se prueba jugando: partidas enteras con la sim de verdad, sin mirar
 * cómo decide. Lo que importa de un rival es que pelee, que no se mate solo y
 * que se le pueda ganar — no qué `if` tomó.
 */

const world = testWorld()

/** Juega `frames` frames: el bot en la ranura 1, el jugador 0 con su propio input. */
function play(
  from: MatchState,
  frames: number,
  player: (state: MatchState, frame: number) => Input = () => NONE,
  bot: Bot = createBot(7),
): { state: MatchState; bot: Bot; inputs: Input[] } {
  let state = from
  let current = bot
  const inputs: Input[] = []
  for (let frame = 0; frame < frames && !state.over; frame += 1) {
    const decided = botStep(current, state, 1, world)
    current = decided.bot
    inputs.push(decided.input)
    state = step(state, [player(state, frame), decided.input], world)
  }
  return { state, bot: current, inputs }
}

describe('el bot', () => {
  it('le gana a alguien que no se mueve', () => {
    // Si ni esto puede, no es un rival: es decoración.
    const { state } = play(initialState(world, 1), TICKS_PER_SECOND * 120)
    expect(state.over).toBe(true)
    expect(state.winner).toBe(1)
  })

  it.each<BotLevel>(['easy', 'normal', 'hard'])('en %s no se mata solo', (level) => {
    // Contra alguien quieto no tiene por qué perder vidas: si las pierde, se
    // está cayendo del escenario por su cuenta.
    const { state } = play(initialState(world, 1), TICKS_PER_SECOND * 30, () => NONE, createBot(3, level))
    expect(state.fighters[1].stocks).toBe(world.rules.stocks)
  })

  it('si lo sacan del escenario, vuelve', () => {
    // Afuera, en el aire, a los dos lados: tiene que volver a pisar sin perder vida.
    for (const x of [SMALL_STAGE.ground.left - fx(90), SMALL_STAGE.ground.right + fx(90)]) {
      const out = withFighter(initialState(world, 1), 1, {
        x,
        y: SMALL_STAGE.ground.top,
        vx: 0,
        vy: 0,
        grounded: false,
        state: 'air',
      })
      let state = out
      let bot = createBot(11)
      let landed = false
      for (let frame = 0; frame < TICKS_PER_SECOND * 5; frame += 1) {
        const decided = botStep(bot, state, 1, world)
        bot = decided.bot
        state = step(state, [NONE, decided.input], world)
        if (state.fighters[1].stocks < world.rules.stocks) break
        if (state.fighters[1].grounded) {
          landed = true
          break
        }
      }
      expect(landed).toBe(true)
      expect(state.fighters[1].stocks).toBe(world.rules.stocks)
    }
  })

  it('si está en una flotante y el rival abajo, se baja a buscarlo', () => {
    const platform = SMALL_STAGE.platforms[0]!
    let state = withFighter(initialState(world, 1), 1, {
      x: platform.left + platform.width / 2,
      y: platform.top,
      grounded: true,
      platform: 0,
    })
    state = withFighter(state, 0, { x: platform.left + platform.width / 2 + fx(10) })
    let bot = createBot(5)
    let leftPlatform = false
    for (let frame = 0; frame < TICKS_PER_SECOND * 3 && !leftPlatform; frame += 1) {
      const decided = botStep(bot, state, 1, world)
      bot = decided.bot
      state = step(state, [NONE, decided.input], world)
      if (state.fighters[1].platform === -1) leftPlatform = true
    }
    expect(leftPlatform).toBe(true)
    expect(state.fighters[1].stocks).toBe(world.rules.stocks)
  })

  it('con la misma semilla juega exactamente igual', () => {
    const a = play(initialState(world, 1), 600).inputs
    const b = play(initialState(world, 1), 600).inputs
    expect(a).toEqual(b)
  })

  it('aprieta los botones en pulsos, como una persona', () => {
    // La sim pega y salta en el flanco: un botón mantenido no hace nada. Nunca
    // tiene que haber dos frames seguidos con el mismo botón de acción.
    const { inputs } = play(initialState(world, 1), 1200)
    const actions = 0b11110000
    for (let i = 1; i < inputs.length; i += 1) {
      expect(inputs[i]! & inputs[i - 1]! & actions).toBe(0)
    }
  })

  it('el fácil tarda más en ganar que el difícil', () => {
    const framesToWin = (level: BotLevel) => {
      let total = 0
      for (const seed of [1, 2, 3]) {
        const { state, inputs } = play(initialState(world, seed), TICKS_PER_SECOND * 240, () => NONE, createBot(seed, level))
        total += state.over ? inputs.length : TICKS_PER_SECOND * 240
      }
      return total
    }
    expect(framesToWin('easy')).toBeGreaterThan(framesToWin('hard'))
  })
})
