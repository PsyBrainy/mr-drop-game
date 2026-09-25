import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { fx } from '../sim/fixed'
import { DODGE, DOWN, HEAVY, LIGHT, NONE, RIGHT, type Input } from '../sim/input'
import { isInvulnerable } from '../sim/resolve'
import { initialState, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * El gravity cancel de Brawlhalla: esquivar quieto en el aire y cortar el esquive
 * con un golpe, que sale como si estuvieras en el piso. Así se tira el jab, la
 * barrida o el gancho arriba.
 */

const world = testWorld()
const { attackCancelFrom, invulnTo, frames: dodgeFrames } = OSO.dodge

/** El 0 en el aire, lejos de todo y del piso; el 1 quieto en el piso, lejos. */
function inTheAir(): MatchState {
  const state = withFighter(initialState(world, 1), 1, { x: SMALL_STAGE.ground.right - fx(20) })
  return withFighter(state, 0, {
    x: SMALL_STAGE.ground.left + fx(120),
    // Alto: un esquive entero cayendo son ~300 px, y no tiene que aterrizar en el medio.
    y: SMALL_STAGE.ground.top - fx(380),
    vy: 0,
    grounded: false,
    state: 'air',
    facing: 1,
  })
}

/** Esquiva con `dodge` en el frame 0 y aprieta `attack` en el frame `at`. Devuelve todos los estados. */
function dodgeThen(start: MatchState, dodge: Input, attack: Input, at: number, frames = 40): MatchState[] {
  const states: MatchState[] = []
  let state = start
  for (let frame = 0; frame < frames; frame += 1) {
    const input = frame === 0 ? dodge : frame === at ? attack : NONE
    state = step(state, [input, NONE], world)
    states.push(state)
  }
  return states
}

const firstAttack = (states: MatchState[]) => states.findIndex((s) => s.fighters[0].state === 'attack')

describe('el gravity cancel', () => {
  it('desde un esquive quieto en el aire, el rápido sale como el de piso', () => {
    const states = dodgeThen(inTheAir(), DODGE, LIGHT, attackCancelFrom)
    const at = firstAttack(states)
    expect(at).toBe(attackCancelFrom)
    const me = states[at]!.fighters[0]
    expect(me.attack).toBe('nLight')
    expect(me.grounded).toBe(false)
  })

  it('con dirección elige el golpe de piso de esa dirección', () => {
    const down = dodgeThen(inTheAir(), DODGE, DOWN | LIGHT, attackCancelFrom)
    expect(down[firstAttack(down)]!.fighters[0].attack).toBe('dLight')
    const heavy = dodgeThen(inTheAir(), DODGE, HEAVY, attackCancelFrom)
    expect(heavy[firstAttack(heavy)]!.fighters[0].attack).toBe('nSig')
  })

  it('no se puede pegar invulnerable: antes de que termine la invulnerabilidad no sale', () => {
    expect(attackCancelFrom).toBeGreaterThan(invulnTo)
    // Apretado apenas termina la invulnerabilidad menos uno: el buffer lo guarda
    // y sale en el primer frame permitido, no antes.
    const states = dodgeThen(inTheAir(), DODGE, LIGHT, attackCancelFrom - 3)
    const at = firstAttack(states)
    expect(at).toBe(attackCancelFrom)
    for (const s of states.slice(0, at + 1)) {
      const me = s.fighters[0]
      if (me.state === 'attack') expect(isInvulnerable(me, OSO)).toBe(false)
    }
  })

  it('el esquive con dirección en el aire no lo habilita: el golpe espera y sale aéreo', () => {
    const states = dodgeThen(inTheAir(), DODGE | RIGHT, LIGHT, dodgeFrames - 2)
    const at = firstAttack(states)
    expect(at).toBeGreaterThanOrEqual(dodgeFrames)
    expect(states[at]!.fighters[0].attack).toBe('nAir')
  })

  it('en el piso no hay gravity cancel: el esquive no se corta', () => {
    const onGround = withFighter(initialState(world, 1), 1, { x: SMALL_STAGE.ground.right - fx(20) })
    const states = dodgeThen(onGround, DODGE, LIGHT, dodgeFrames - 2)
    expect(firstAttack(states)).toBeGreaterThanOrEqual(dodgeFrames)
  })

  it('gasta un salto de aire, como cualquier esquive en el aire', () => {
    const states = dodgeThen(inTheAir(), DODGE, LIGHT, attackCancelFrom)
    expect(states[0]!.fighters[0].airJumpsLeft).toBe(OSO.airJumps - 1)
  })

  it('si el golpe de piso toca el piso, sigue: no es un aéreo que se corta', () => {
    // Bajito: el esquive quieto frena la caída, el golpe sale y aterriza en el medio.
    const low = withFighter(inTheAir(), 0, { y: SMALL_STAGE.ground.top - fx(30) })
    const states = dodgeThen(low, DODGE, HEAVY, attackCancelFrom, 80)
    const at = firstAttack(states)
    expect(states[at]!.fighters[0].attack).toBe('nSig')
    const landed = states.findIndex((s, i) => i > at && s.fighters[0].grounded)
    expect(landed).toBeGreaterThan(at)
    const me = states[landed]!.fighters[0]
    expect(me.state).toBe('attack')
    expect(me.attack).toBe('nSig')
    expect(me.landLag).toBe(0)
  })
})
