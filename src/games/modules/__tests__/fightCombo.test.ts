import { describe, expect, it } from 'vitest'
import { OSO } from '../../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../../fight/data/stage'
import { fx } from '../../../fight/sim/fixed'
import { LIGHT, NONE, RIGHT, type Input } from '../../../fight/sim/input'
import { initialState, type MatchState } from '../../../fight/sim/state'
import { step } from '../../../fight/sim/tick'
import type { World } from '../../../fight/sim/world'
import { testWorld, withFighter } from '../../../fight/__tests__/harness'
import { COMBO_LINGER, comboLabels, comboStep, NO_COMBO, type ComboState } from '../fightCombo'

/**
 * El contador se prueba jugando: se miran los labels que mostraría el HUD
 * frame a frame con la sim de verdad.
 */

const world = testWorld()

/** Un mundo donde el jab aturde 50 frames sin empujar: dos jabs seguidos son combo seguro. */
function stickyWorld(): World {
  const sticky = { ...OSO.moves.nLight, hitstun: 50, knockback: { x: 0, y: 0 } }
  const tuning = { ...OSO, moves: { ...OSO.moves, nLight: sticky } }
  return { ...world, tuning: [tuning, tuning] }
}

function facing(): MatchState {
  let state = initialState(world, 1)
  state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
  return withFighter(state, 1, { x: SMALL_STAGE.spawns[0].x + OSO.halfWidth * 2 + fx(4), facing: -1 })
}

function run(w: World, frames: number, input: (frame: number) => Input) {
  let state = facing()
  let combo: ComboState = NO_COMBO
  const labels: (string | null)[] = []
  for (let frame = 0; frame < frames; frame += 1) {
    const next = step(state, [input(frame), NONE], w)
    combo = comboStep(combo, state, next)
    labels.push(comboLabels(combo, next)[0])
    state = next
  }
  return { labels, combo }
}

describe('el contador de combo', () => {
  it('dos golpes con el rival aturdido cuentan: "2 golpes"', () => {
    // El segundo jab se aprieta apenas se recupera el primero (17 frames).
    const { labels } = run(stickyWorld(), 60, (f) => (f === 0 || f === 18 ? LIGHT : NONE))
    expect(labels).toContain('2 golpes')
    expect(labels.every((l) => l === null || l === '2 golpes')).toBe(true)
  })

  it('un golpe solo no muestra nada', () => {
    const { labels } = run(world, 60, (f) => (f === 0 ? LIGHT : NONE))
    expect(labels.every((l) => l === null)).toBe(true)
  })

  it('dos golpes con el rival ya recuperado no son combo', () => {
    // En el mundo normal el rival sale del hitstun antes del segundo jab.
    const { labels } = run(world, 90, (f) => (f === 0 || f === 45 ? RIGHT | LIGHT : NONE))
    expect(labels.every((l) => l === null)).toBe(true)
  })

  it('cortado el combo, el número queda un rato y se va', () => {
    const { labels } = run(stickyWorld(), 200, (f) => (f === 0 || f === 18 ? LIGHT : NONE))
    const last = labels.lastIndexOf('2 golpes')
    expect(last).toBeGreaterThan(0)
    expect(labels.slice(last + 1).every((l) => l === null)).toBe(true)
    const first = labels.indexOf('2 golpes')
    expect(last - first).toBeGreaterThanOrEqual(COMBO_LINGER)
  })
})
