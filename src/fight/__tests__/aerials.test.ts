import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { pressFor } from '../data/combos'
import { SMALL_STAGE } from '../data/stage'
import { fx } from '../sim/fixed'
import { DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, type Input } from '../sim/input'
import { initialState, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * Los aéreos con dirección. Lo central es el spike (`dAir`): el golpe para abajo
 * que saca al que está afuera colgando del borde, que tiene que ser una
 * herramienta que se gana con daño, no un KO a 0.
 */

const world = testWorld()

function run(state: MatchState, frames: number, inputs: (frame: number, state: MatchState) => readonly [Input, Input]): MatchState {
  let current = state
  for (let frame = 0; frame < frames; frame += 1) current = step(current, inputs(frame, current), world)
  return current
}

/**
 * El 1 está afuera del escenario (a `dx` del borde derecho, `dy` por debajo del
 * piso), en el aire, con todos sus saltos; el 0 está arriba suyo, a `height`.
 */
function edge(dx: number, dy: number, damage: number, height: number): MatchState {
  const x = SMALL_STAGE.ground.right + fx(dx)
  const y = SMALL_STAGE.ground.top + fx(dy)
  let state = initialState(world, 1)
  state = withFighter(state, 1, { x, y, vy: 0, grounded: false, state: 'air', damage, facing: -1 })
  return withFighter(state, 0, { x: x - fx(10), y: y - fx(height), vy: 0, grounded: false, state: 'air', facing: 1 })
}

/** Le tira el spike desde la primera altura que entra. `null` si ninguna. */
function spiked(dx: number, dy: number, damage: number): MatchState | null {
  for (let height = 20; height < 90; height += 4) {
    let state = edge(dx, dy, damage, height)
    for (let frame = 0; frame < 30; frame += 1) {
      state = step(state, [frame < 2 ? DOWN | LIGHT : NONE, NONE], world)
      if (state.fighters[1].hitstun > 0) return state
    }
  }
  return null
}

/**
 * ¿El 1 vuelve jugando bien? Hacia el escenario, saltos espaciados, colgarse y
 * saltar de la pared, y el recovery cuando se quedó sin saltos, probando varios
 * ritmos. Alcanza con que alguno llegue.
 */
function survives(afterHit: MatchState): boolean {
  for (const gap of [8, 12, 16, 20, 26]) {
    for (const delay of [0, 4, 8, 16, 24]) {
      let state = afterHit
      let since = 99
      let previous = NONE
      let outOfJumps = -1
      for (let frame = 0; frame < 400; frame += 1) {
        const me = state.fighters[1]
        let input = me.state === 'cling' ? JUMP : LEFT | (me.vy >= 0 && since >= gap ? JUMP : NONE)
        if (me.airJumpsLeft === 0 && me.state === 'air') {
          if (outOfJumps < 0) outOfJumps = frame
          if (frame - outOfJumps === delay) input = LEFT | HEAVY
        }
        if (previous & JUMP) input &= ~JUMP
        since = input & JUMP ? 0 : since + 1
        previous = input
        state = step(state, [NONE, input], world)
        if (state.fighters[1].stocks < 3) break
        if (state.fighters[1].grounded) return true
      }
    }
  }
  return false
}

const EDGES = [[30, 0], [30, 60], [60, 40]] as const

describe('el spike', () => {
  it('manda para abajo', () => {
    const hit = spiked(60, 40, 0)!
    expect(hit.fighters[1].vy).toBeGreaterThan(0)
  })

  it.each(EDGES)('a poco daño, desde %i px afuera y %i abajo, se vuelve', (dx, dy) => {
    for (const damage of [0, 40]) expect(survives(spiked(dx, dy, damage)!)).toBe(true)
  })

  it.each(EDGES)('con daño, desde %i px afuera y %i abajo, te hunde', (dx, dy) => {
    expect(survives(spiked(dx, dy, 130)!)).toBe(false)
  })

  it('sobre el escenario te estrella y te levantás: no queda nadie tirado y aturdido', () => {
    let state = initialState(world, 1)
    state = withFighter(state, 1, { x: SMALL_STAGE.spawns[0].x + fx(8), damage: 60 })
    state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, y: SMALL_STAGE.ground.top - fx(40), vy: 0, grounded: false, state: 'air', facing: 1 })
    const hitAt = run(state, 30, (f) => [f < 2 ? DOWN | LIGHT : NONE, NONE])
    const victim = run(hitAt, 3, () => [NONE, NONE]).fighters[1]
    expect(victim.grounded).toBe(true)
    expect(victim.hitstun).toBe(0)
    expect(victim.y).toBe(SMALL_STAGE.ground.top)
  })
})

describe('otros golpes que te hacen aterrizar', () => {
  it('no pierden el hitstun: sólo el spike estrella', () => {
    let state = initialState(world, 1)
    state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
    state = withFighter(state, 1, { x: SMALL_STAGE.spawns[0].x + OSO.halfWidth * 2 + fx(10), facing: -1, damage: 150 })
    const press = pressFor('sLight', 1)
    let landedInHitstun = false
    run(state, 60, (f, s) => {
      const v = s.fighters[1]
      if (v.grounded && v.hitstun > 0 && v.state === 'hitstun') landedInHitstun = true
      return [f < 2 ? press : NONE, NONE]
    })
    expect(landedInHitstun).toBe(true)
  })
})

describe('la caída en picada', () => {
  const pound = OSO.moves.groundPound

  it('baja en picada aunque vengas subiendo', () => {
    const state = withFighter(initialState(world, 1), 0, { y: SMALL_STAGE.ground.top - fx(200), vy: fx(-8), grounded: false, state: 'air' })
    const at = run(state, pound.motion!.frame + 1, (f) => [f === 0 ? DOWN | HEAVY : NONE, NONE]).fighters[0]
    expect(at.attack).toBe('groundPound')
    expect(at.vy).toBe(pound.motion!.vy + OSO.gravity)
  })

  it('errarla y tocar el piso cuesta caro', () => {
    const state = withFighter(initialState(world, 1), 0, { y: SMALL_STAGE.ground.top - fx(60), vy: 0, grounded: false, state: 'air' })
    let lag = 0
    run(state, 40, (f, s) => {
      lag = Math.max(lag, s.fighters[0].landLag)
      return [f === 0 ? DOWN | HEAVY : NONE, NONE]
    })
    expect(lag).toBe(pound.landingLag)
    expect(pound.landingLag!).toBeGreaterThan(OSO.landFrames * 3)
  })
})

describe('el empuje en hitstun', () => {
  it('con mucho daño manda más rápido que una caída normal', () => {
    // Antes de F4 se recortaba a `maxFall` y el daño dejaba de importar en vertical.
    let state = initialState(world, 1)
    state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
    state = withFighter(state, 1, { x: SMALL_STAGE.spawns[0].x + fx(16), facing: -1, damage: 150 })
    let fastest = 0
    const press = pressFor('nSig', 1)
    run(state, 40, (f, s) => {
      // Desde el segundo frame del vuelo: en el del golpe la velocidad es la que
      // pone el golpe, y el techo lo aplica la física del frame siguiente.
      const victim = s.fighters[1]
      if (victim.state === 'hitstun' && victim.stateFrames >= 1) fastest = Math.min(fastest, victim.vy)
      return [f < 2 ? press : NONE, NONE]
    })
    expect(-fastest).toBeGreaterThan(OSO.maxFall)
    expect(-fastest).toBeLessThanOrEqual(OSO.knockbackMaxSpeed)
  })
})
