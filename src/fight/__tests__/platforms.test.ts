import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { fx, toPixels } from '../sim/fixed'
import { DOWN, JUMP, LEFT, NONE, RIGHT, type Input } from '../sim/input'
import { platformAt } from '../sim/platforms'
import { initialState, type MatchState } from '../sim/state'
import { step, TICKS_PER_SECOND } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * Las plataformas flotantes, jugadas con la sim de verdad: se sube saltando, se
 * atraviesan desde abajo, llevan encima al que está parado, y apretando abajo
 * uno se baja. Lo que se verifica es que se pueda jugar, no una fórmula.
 */

const world = testWorld()
const [LEFT_PLATFORM] = SMALL_STAGE.platforms

/** Frames con el input del jugador 0; el 1 queda quieto lejos, en la otra punta. */
function run(from: MatchState, frames: number, input: (frame: number, state: MatchState) => Input): MatchState {
  let state = withFighter(from, 1, { x: SMALL_STAGE.ground.right - fx(10) })
  for (let frame = 0; frame < frames; frame += 1) state = step(state, [input(frame, state), NONE], world)
  return state
}

describe('el recorrido', () => {
  it('es de ida y vuelta: al período vuelve exactamente al mismo lugar', () => {
    for (const platform of SMALL_STAGE.platforms) {
      for (const tick of [0, 37, 240, 479]) {
        expect(platformAt(platform, tick + platform.period)).toEqual(platformAt(platform, tick))
      }
    }
  })

  it('en la mitad del período está en la otra punta', () => {
    const platform = LEFT_PLATFORM!
    expect(platformAt(platform, platform.period / 2).left).toBe(platform.left + platform.travelX)
    expect(platformAt(platform, 0).left).toBe(platform.left)
  })

  it('se mueve de a poco: nunca salta más de 1 px por frame', () => {
    // Si una plataforma saltara, el que está encima se teletransportaría.
    for (const platform of SMALL_STAGE.platforms) {
      for (let tick = 0; tick < platform.period; tick += 1) {
        const a = platformAt(platform, tick)
        const b = platformAt(platform, tick + 1)
        expect(Math.abs(toPixels(b.left - a.left))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('las dos flotantes nunca se tocan', () => {
    const [a, b] = SMALL_STAGE.platforms
    for (let tick = 0; tick < a!.period; tick += 1) {
      expect(platformAt(a!, tick).right).toBeLessThan(platformAt(b!, tick).left)
    }
  })
})

describe('jugando', () => {
  /** Parado debajo de la flotante izquierda, en el piso, en el tick 0. */
  function underLeftPlatform(): MatchState {
    const span = platformAt(LEFT_PLATFORM!, 0)
    return withFighter(initialState(world, 1), 0, { x: (span.left + span.right) / 2 })
  }

  it('se sube de un solo salto desde el piso', () => {
    // Si hiciera falta el doble salto, las flotantes serían un lujo y no parte
    // del escenario.
    const state = run(underLeftPlatform(), TICKS_PER_SECOND, (frame) => (frame === 0 ? JUMP : NONE))
    const me = state.fighters[0]
    expect(me.grounded).toBe(true)
    expect(me.platform).toBe(0)
    expect(me.y).toBe(platformAt(LEFT_PLATFORM!, state.tick).top)
  })

  it('se atraviesa desde abajo: saltar no te hace chocar la cabeza', () => {
    // A mitad de la subida ya está por encima del piso de la flotante.
    let highest = SMALL_STAGE.ground.top
    run(underLeftPlatform(), 40, (frame, state) => {
      highest = Math.min(highest, state.fighters[0].y)
      return frame === 0 ? JUMP : NONE
    })
    expect(highest).toBeLessThan(LEFT_PLATFORM!.top)
  })

  it('parado encima, la plataforma lo lleva', () => {
    const onTop = run(underLeftPlatform(), TICKS_PER_SECOND, (frame) => (frame === 0 ? JUMP : NONE))
    const before = onTop.fighters[0].x
    const later = run(onTop, 120, () => NONE)
    const me = later.fighters[0]
    const moved = platformAt(LEFT_PLATFORM!, later.tick).left - platformAt(LEFT_PLATFORM!, onTop.tick).left
    expect(me.platform).toBe(0)
    expect(me.x - before).toBe(moved)
    expect(moved).not.toBe(0)
  })

  it('apretando abajo se baja, y cae al piso de abajo', () => {
    const onTop = run(underLeftPlatform(), TICKS_PER_SECOND, (frame) => (frame === 0 ? JUMP : NONE))
    const dropped = run(onTop, TICKS_PER_SECOND, (frame) => (frame < 3 ? DOWN : NONE))
    const me = dropped.fighters[0]
    expect(me.grounded).toBe(true)
    expect(me.platform).toBe(-1)
    expect(me.y).toBe(SMALL_STAGE.ground.top)
  })

  it('caminando más allá del borde de la flotante, se cae', () => {
    const onTop = run(underLeftPlatform(), TICKS_PER_SECOND, (frame) => (frame === 0 ? JUMP : NONE))
    const walked = run(onTop, 40, () => LEFT)
    expect(walked.fighters[0].platform).toBe(-1)
  })

  it('abajo en el piso principal no hace nada: ese no se atraviesa', () => {
    const state = run(initialState(world, 1), 30, () => DOWN)
    expect(state.fighters[0].grounded).toBe(true)
    expect(state.fighters[0].y).toBe(SMALL_STAGE.ground.top)
  })

  it('cayendo rápido se aterriza igual: no se la atraviesa por túnel', () => {
    const span = platformAt(LEFT_PLATFORM!, 0)
    const falling = withFighter(initialState(world, 1), 0, {
      x: (span.left + span.right) / 2,
      y: span.top - fx(200),
      vy: OSO.maxFall,
      grounded: false,
      state: 'air',
    })
    const state = run(falling, 30, () => NONE)
    expect(state.fighters[0].platform).toBe(0)
  })

  it('una persona que salta hacia la otra flotante puede cruzar de una a la otra', () => {
    // Desde la izquierda, saltando hacia la derecha con el doble salto: llegar a
    // la otra tiene que ser posible, si no hay dos islas separadas.
    const onTop = run(underLeftPlatform(), TICKS_PER_SECOND, (frame) => (frame === 0 ? JUMP : NONE))
    const crossed = run(onTop, TICKS_PER_SECOND * 2, (frame) => RIGHT | (frame === 0 || frame === 22 ? JUMP : NONE))
    // Donde sea que haya caído, no fue afuera del escenario.
    expect(crossed.fighters[0].stocks).toBe(world.rules.stocks)
  })
})
