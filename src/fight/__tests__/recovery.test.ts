import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { airMoveBit } from '../sim/attack'
import { fx } from '../sim/fixed'
import { DODGE, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../sim/input'
import { initialState, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * El recovery: el fuerte en el aire, que te impulsa para arriba pegando. Una vez
 * por vuelo, se recarga al tocar el piso o al recibir un golpe, y es lo que
 * separa volver de no volver cuando ya gastaste los saltos.
 */

const world = testWorld()
const RECOVERY = OSO.moves.recovery
const USED = airMoveBit('recovery')

/** El 0 en el aire, lejos de todo, cayendo; el 1 quieto en el piso. */
function falling(patch: Parameters<typeof withFighter>[2] = {}): MatchState {
  const state = withFighter(initialState(world, 1), 1, { x: SMALL_STAGE.ground.left + fx(40) })
  return withFighter(state, 0, {
    x: SMALL_STAGE.ground.right + fx(150),
    y: SMALL_STAGE.ground.top - fx(100),
    vy: OSO.maxFall,
    grounded: false,
    state: 'air',
    ...patch,
  })
}

function run(state: MatchState, frames: number, input: (frame: number, state: MatchState) => Input): MatchState {
  let current = state
  for (let frame = 0; frame < frames; frame += 1) current = step(current, [input(frame, current), NONE], world)
  return current
}

describe('el impulso', () => {
  it('cayendo a toda velocidad, el recovery corta la caída y sube', () => {
    const start = falling()
    const at = run(start, RECOVERY.motion!.frame + 1, (f) => (f === 0 ? HEAVY : NONE)).fighters[0]
    expect(at.attack).toBe('recovery')
    // Reemplaza: venía bajando a maxFall, y ahora sube (más la gravedad de ese frame).
    expect(at.vy).toBe(RECOVERY.motion!.vy! + OSO.gravity)
    expect(at.vy).toBeLessThan(0)
  })

  it('sube más que un salto de aire', () => {
    let highest = falling().fighters[0].y
    run(falling({ vy: 0 }), 40, (f, s) => {
      highest = Math.min(highest, s.fighters[0].y)
      return f === 0 ? HEAVY : NONE
    })
    let highestJump = falling().fighters[0].y
    run(falling({ vy: 0 }), 40, (f, s) => {
      highestJump = Math.min(highestJump, s.fighters[0].y)
      return f === 0 ? JUMP : NONE
    })
    expect(highest).toBeLessThan(highestJump)
  })
})

describe('una vez por vuelo', () => {
  it('el segundo en el mismo vuelo no sale, y no sale otro golpe en su lugar', () => {
    const used = run(falling({ vy: 0 }), 40, (f) => (f === 0 ? HEAVY : NONE))
    expect(used.fighters[0].airMovesUsed & USED).toBe(USED)
    const again = run(used, 2, (f) => (f === 0 ? HEAVY : NONE)).fighters[0]
    expect(again.state).not.toBe('attack')
    expect(again.hitId).toBe(used.fighters[0].hitId)
  })

  it('se recarga al tocar el piso', () => {
    const onStage = withFighter(initialState(world, 1), 0, { airMovesUsed: USED, grounded: false, state: 'air', y: SMALL_STAGE.ground.top - fx(40) })
    const landed = run(onStage, 30, () => NONE).fighters[0]
    expect(landed.grounded).toBe(true)
    expect(landed.airMovesUsed).toBe(0)
  })

  it('se recarga al recibir un golpe', () => {
    let state = initialState(world, 1)
    state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
    state = withFighter(state, 1, { x: SMALL_STAGE.spawns[0].x + OSO.halfWidth * 2 + fx(10), facing: -1, airMovesUsed: USED })
    const hit = run(state, OSO.moves.nLight.startup + 2, (f) => (f < 2 ? LIGHT : NONE))
    expect(hit.fighters[1].hitstun).toBeGreaterThan(0)
    expect(hit.fighters[1].airMovesUsed).toBe(0)
  })

  it('colgarse de la pared no lo recarga', () => {
    // Contra el costado izquierdo del escenario, gastado, empujando hacia la pared.
    const state = withFighter(initialState(world, 1), 0, {
      x: SMALL_STAGE.ground.left - OSO.halfWidth - fx(4),
      y: SMALL_STAGE.ground.top + fx(60),
      vy: 0,
      grounded: false,
      state: 'air',
      airMovesUsed: USED,
    })
    const clung = run(state, 10, () => RIGHT)
    expect(clung.fighters[0].state).toBe('cling')
    expect(clung.fighters[0].airMovesUsed).toBe(USED)
  })
})

/**
 * Volver al escenario: como en `fighter.test.ts`, pero pudiendo usar el recovery
 * una vez gastados los saltos, probando varios momentos para tirarlo.
 */
function canRecoverFrom(dx: number, dy: number, useRecovery: boolean): boolean {
  for (const gap of [8, 12, 16, 20, 26]) {
    for (const delay of useRecovery ? [0, 4, 8, 16, 24] : [0]) {
      let state = falling({ x: SMALL_STAGE.ground.right + fx(dx), y: SMALL_STAGE.ground.top + fx(dy), vy: fx(3) })
      let since = 99
      let previous = NONE
      let outOfJumps = -1
      for (let frame = 0; frame < 360; frame += 1) {
        const me = state.fighters[0]
        let input = me.state === 'cling' ? JUMP : LEFT | (me.vy >= 0 && since >= gap ? JUMP : NONE)
        if (useRecovery && me.airJumpsLeft === 0 && me.state === 'air') {
          if (outOfJumps < 0) outOfJumps = frame
          if (frame - outOfJumps === delay) input = LEFT | HEAVY
        }
        if (previous & JUMP) input &= ~JUMP
        since = input & JUMP ? 0 : since + 1
        previous = input
        state = step(state, [input, NONE], world)
        if (state.fighters[0].stocks < 3) break
        if (state.fighters[0].grounded) return true
      }
    }
  }
  return false
}

describe('volver al escenario', () => {
  it('desde lejos y abajo del borde se vuelve con el recovery y no sin él', () => {
    // Es lo que hace que gastarlo sea una decisión: sin él, estos lugares son
    // un KO; con él, se vuelve jugando bien.
    for (const [dx, dy] of [[230, 200], [200, 280], [170, 320]] as const) {
      expect(canRecoverFrom(dx, dy, false)).toBe(false)
      expect(canRecoverFrom(dx, dy, true)).toBe(true)
    }
  })

  it('de muy lejos no se vuelve ni con el recovery: el golpe fuerte tiene que poder matar', () => {
    expect(canRecoverFrom(300, 0, true)).toBe(false)
  })

  it('nadie se queda en el aire para siempre, gaste lo que gaste y en el orden que sea', () => {
    // Lejos de las paredes y sin piso abajo: la única salida es la zona de muerte.
    // Cada estrategia gasta saltos, esquives y el recovery en otro orden y con
    // otro ritmo; todas tienen que terminar cayendo.
    const resources: Input[][] = [
      [JUMP, JUMP, HEAVY],
      [HEAVY, JUMP, JUMP],
      [JUMP, HEAVY, JUMP],
      [DODGE, HEAVY, JUMP],
      [JUMP, DODGE, HEAVY],
    ]
    for (const order of resources) {
      for (const gap of [1, 6, 12, 20, 30]) {
        let state = falling({ x: SMALL_STAGE.blastRight - fx(60), vy: 0 })
        let lost = false
        for (let frame = 0; frame < 600 && !lost; frame += 1) {
          const k = frame / gap
          const input = Number.isInteger(k) && k < order.length ? order[k]! : NONE
          state = step(state, [input, NONE], world)
          lost = state.fighters[0].stocks < 3
        }
        expect(lost).toBe(true)
      }
    }
  })
})
