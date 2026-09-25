import { describe, expect, it } from 'vitest'
import { botStep, createBot, type Bot, type BotLevel } from '../bot/bot'
import { SMALL_STAGE } from '../data/stage'
import type { MoveKey } from '../sim/attack'
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

  it.each<BotLevel>(['easy', 'medium', 'hard'])('en %s no se mata solo', (level) => {
    // Contra alguien quieto no tiene por qué perder vidas: si las pierde, se
    // está cayendo del escenario por su cuenta.
    const { state } = play(initialState(world, 1), TICKS_PER_SECOND * 30, () => NONE, createBot(3, level))
    expect(state.fighters[1].stocks).toBe(world.rules.stocks)
  })

  it.each<BotLevel>(['easy', 'medium', 'hard'])('en %s, si lo sacan del escenario, vuelve', (level) => {
    // Afuera, en el aire, a los dos lados, cerca y lejos, a la altura del piso
    // y más abajo: tiene que volver a pisar sin perder vida.
    const spots: Array<[number, number]> = []
    for (const gap of [fx(60), fx(150)]) {
      for (const depth of [0, fx(60)]) {
        spots.push([SMALL_STAGE.ground.left - gap, depth], [SMALL_STAGE.ground.right + gap, depth])
      }
    }
    for (const [x, depth] of spots) {
      const out = withFighter(initialState(world, 1), 1, {
        x,
        y: SMALL_STAGE.ground.top + depth,
        vx: 0,
        vy: 0,
        grounded: false,
        state: 'air',
      })
      let state = out
      let bot = createBot(11, level)
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

  it.each<BotLevel>(['easy', 'medium', 'hard'])('en %s vuelve desde donde sólo se vuelve con el recovery', (level) => {
    // 230 px afuera y 200 por debajo del piso: con saltos y pared solos no se
    // llega (recovery.test.ts lo verifica). El bot tiene que usar el recovery.
    const start = withFighter(initialState(world, 1), 1, {
      x: SMALL_STAGE.ground.right + fx(230),
      y: SMALL_STAGE.ground.top + fx(200),
      vx: 0,
      vy: fx(3),
      grounded: false,
      state: 'air',
    })
    let state = start
    let bot = createBot(3, level)
    let usedRecovery = false
    for (let frame = 0; frame < 360 && !state.fighters[1].grounded; frame += 1) {
      const decided = botStep(bot, state, 1, world)
      bot = decided.bot
      state = step(state, [NONE, decided.input], world)
      if (state.fighters[1].attack === 'recovery') usedRecovery = true
    }
    expect(state.fighters[1].stocks).toBe(3)
    expect(state.fighters[1].grounded).toBe(true)
    expect(usedRecovery).toBe(true)
  })

  it.each([
    ['medium', 'easy', 4],
    ['hard', 'medium', 5],
  ] as const)('%s pelea con los golpes con dirección', (level, rival, atLeast) => {
    // Un bot que sólo tira el puño de costado no enseña los golpes nuevos: el
    // jugador aprende mirando lo que le hacen.
    const used = movesUsed(level, rival)
    expect(used.size).toBeGreaterThanOrEqual(atLeast)
    expect(used.has('dLight')).toBe(true)
  })

  it('cada nivel le gana al anterior la mayoría de las veces', () => {
    // Bot contra bot: la forma más directa de medir que "más difícil" es de
    // verdad más difícil, y no sólo más rápido contra un muñeco quieto.
    expect(duel('medium', 'easy', 12).wins).toBeGreaterThan(8)
    expect(duel('hard', 'medium', 6).wins).toBeGreaterThan(4)
  })

  it.each<BotLevel>(['easy', 'medium', 'hard'])('en %s no se cae solo peleando', (level) => {
    // Contra un rival que pega, perder vidas es parte del juego; perderlas sin
    // que nadie lo haya tocado hace rato, no: eso es tirarse del borde.
    expect(duel(level, 'medium', 4).selfKnockouts).toBe(0)
  })
})

/** Bot contra bot, `rounds` partidas: cuántas ganó el primero y cuántas vidas perdió solo. */
function duel(first: BotLevel, second: BotLevel, rounds: number): { wins: number; selfKnockouts: number } {
  let wins = 0
  let selfKnockouts = 0
  for (let seed = 1; seed <= rounds; seed += 1) {
    let state = initialState(world, seed)
    let a = createBot(seed * 7, first)
    let b = createBot(seed * 13 + 1, second)
    let lastHit = -Infinity
    for (let frame = 0; frame < TICKS_PER_SECOND * 300 && !state.over; frame += 1) {
      const da = botStep(a, state, 0, world)
      const db = botStep(b, state, 1, world)
      a = da.bot
      b = db.bot
      const stocks = state.fighters[0].stocks
      state = step(state, [da.input, db.input], world)
      if (state.fighters[0].hitstun > 0) lastHit = frame
      // Un segundo y medio sin que lo toquen y pierde una vida: se cayó solo.
      if (state.fighters[0].stocks < stocks && frame - lastHit > 90) selfKnockouts += 1
    }
    if (state.winner === 0) wins += 1
  }
  return { wins, selfKnockouts }
}

/** Qué golpes tiró el primero en dos partidas contra el segundo. */
function movesUsed(first: BotLevel, second: BotLevel): Set<MoveKey> {
  const used = new Set<MoveKey>()
  for (let seed = 1; seed <= 2; seed += 1) {
    let state = initialState(world, seed)
    let a = createBot(seed * 7, first)
    let b = createBot(seed * 13 + 1, second)
    for (let frame = 0; frame < TICKS_PER_SECOND * 120 && !state.over; frame += 1) {
      const da = botStep(a, state, 0, world)
      const db = botStep(b, state, 1, world)
      a = da.bot
      b = db.bot
      state = step(state, [da.input, db.input], world)
      const attack = state.fighters[0].attack
      if (attack) used.add(attack)
    }
  }
  return used
}
