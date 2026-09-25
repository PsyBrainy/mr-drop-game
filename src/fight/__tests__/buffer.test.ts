import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { totalFrames } from '../sim/attack'
import { DOWN, LIGHT, NONE, type Input } from '../sim/input'
import { initialState, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * El buffer de golpe: un golpe apretado cuando todavía no se puede pegar sale
 * apenas se pueda. Es la base de cualquier combo — sin esto, encadenar exige
 * clavar el frame exacto.
 */

const world = testWorld()
const light = OSO.moves.nLight
const lightFrames = totalFrames(light)

/** El 0 solo en el piso, el 1 lejos. */
function alone(): MatchState {
  const state = withFighter(initialState(world, 1), 1, { x: SMALL_STAGE.ground.right })
  return withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
}

/** Corre `frames` ticks con el input que diga `input(frame)` para el 0. */
function run(state: MatchState, frames: number, input: (frame: number) => Input): MatchState[] {
  const states: MatchState[] = []
  let current = state
  for (let frame = 0; frame < frames; frame += 1) {
    current = step(current, [input(frame), NONE], world)
    states.push(current)
  }
  return states
}

describe('el buffer de golpe', () => {
  it('un rápido apretado en el final del recovery sale en el primer frame libre', () => {
    const pressAt = lightFrames - 3
    const states = run(alone(), lightFrames + 10, (f) => (f === 0 || f === pressAt ? LIGHT : NONE))
    const second = states.findIndex((s, i) => i > 0 && s.fighters[0].hitId === 2)
    // El primer golpe arranca en el frame 0 y termina cuando su reloj llega al
    // total: el segundo sale justo ahí, ni uno después.
    expect(second).toBe(lightFrames)
    expect(states[second]!.fighters[0].stateFrames).toBe(0)
  })

  it('apretado de más lejos que la ventana, se pierde', () => {
    const pressAt = lightFrames - OSO.attackBufferFrames - 2
    const states = run(alone(), lightFrames + 20, (f) => (f === 0 || f === pressAt ? LIGHT : NONE))
    expect(states.at(-1)!.fighters[0].hitId).toBe(1)
  })

  it('guarda la dirección del momento en que se apretó', () => {
    // Abajo + rápido durante el recovery, y abajo se suelta antes de que salga.
    const pressAt = lightFrames - 3
    const states = run(alone(), lightFrames + 2, (f) => (f === 0 ? LIGHT : f === pressAt ? DOWN | LIGHT : NONE))
    expect(states[lightFrames]!.fighters[0].attack).toBe('dLight')
  })

  it('recibir un golpe borra lo que se había pedido', () => {
    // El 1 tiene un rápido guardado mientras aterriza, y el 0 le pega antes de que salga.
    let state = initialState(world, 1)
    state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
    state = withFighter(state, 1, {
      x: SMALL_STAGE.spawns[0].x + OSO.halfWidth * 2 + 256 * 10,
      facing: -1,
      landLag: 30,
      attackBuffer: 6,
      bufferedButton: 'light',
    })
    const states = run(state, 80, (f) => (f < 2 ? LIGHT : NONE))
    const hit = states.findIndex((s) => s.fighters[1].hitstun > 0)
    expect(hit).toBeGreaterThan(0)
    expect(states[hit]!.fighters[1].attackBuffer).toBe(0)
    expect(states.some((s) => s.fighters[1].state === 'attack')).toBe(false)
  })
})
