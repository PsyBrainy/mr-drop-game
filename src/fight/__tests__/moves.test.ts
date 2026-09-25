import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { MOVE_CODES, MOVE_KEYS, type MoveKey } from '../sim/attack'
import { DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, UP, type Input } from '../sim/input'
import { aimOf, moveFor, type Aim, type AttackButton } from '../sim/moves'
import { initialState, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import { testWorld, withFighter } from './harness'

/**
 * La tabla de golpes: botón × dirección × piso/aire. Lo que se verifica es que
 * la tabla sea completa y sin ambigüedades — cada input posible da exactamente un
 * golpe — y que el tick la use de verdad.
 */

const world = testWorld()
const BUTTONS: readonly AttackButton[] = ['light', 'heavy']
const AIMS: readonly Aim[] = ['neutral', 'side', 'down']

describe('la tabla', () => {
  it('cada uno de los 256 inputs posibles apunta a exactamente una dirección', () => {
    for (let input = 0; input < 256; input += 1) {
      expect(AIMS).toContain(aimOf(input))
    }
  })

  it('arriba es neutro: apuntar para arriba no es una dirección propia', () => {
    expect(aimOf(UP)).toBe('neutral')
    expect(aimOf(NONE)).toBe('neutral')
  })

  it('izquierda y derecha a la vez es neutro, como al caminar', () => {
    expect(aimOf(LEFT | RIGHT)).toBe('neutral')
  })

  it('abajo le gana al costado: la diagonal da el golpe bajo', () => {
    expect(aimOf(DOWN | RIGHT)).toBe('down')
    expect(aimOf(DOWN | LEFT | UP)).toBe('down')
  })

  it('cada golpe del personaje sale de algún casillero, y ninguno sobra', () => {
    const reached = new Set<MoveKey>()
    for (const grounded of [true, false]) {
      for (const button of BUTTONS) for (const aim of AIMS) reached.add(moveFor(grounded, button, aim))
    }
    expect([...reached].sort()).toEqual([...MOVE_KEYS].sort())
  })

  it('piso y aire no comparten golpes: pegar en el aire es otra cosa', () => {
    for (const button of BUTTONS) {
      for (const aim of AIMS) expect(moveFor(true, button, aim)).not.toBe(moveFor(false, button, aim))
    }
  })

  it('cada golpe tiene su código de hash, distinto de los otros y del 0', () => {
    const codes = MOVE_KEYS.map((key) => MOVE_CODES[key])
    expect(new Set(codes).size).toBe(MOVE_KEYS.length)
    expect(codes).not.toContain(0)
  })

  it('el personaje trae los once, validados', () => {
    for (const key of MOVE_KEYS) expect(OSO.moves[key]).toBeDefined()
  })
})

describe('el tick usa la tabla', () => {
  /** El 0 en el piso, lejos del 1, mirando a la derecha. */
  function alone(): MatchState {
    const state = withFighter(initialState(world, 1), 1, { x: SMALL_STAGE.ground.right })
    return withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
  }

  function attackWith(state: MatchState, input: Input): MatchState {
    return step(state, [input, NONE], world)
  }

  /** En el aire, lejos del piso: unos frames después de saltar. */
  function airborne(): MatchState {
    let state = alone()
    state = step(state, [JUMP, NONE], world)
    for (let frame = 0; frame < 6; frame += 1) state = step(state, [NONE, NONE], world)
    expect(state.fighters[0].grounded).toBe(false)
    return state
  }

  it.each([
    ['rápido quieto', LIGHT, 'nLight'],
    ['rápido de costado', RIGHT | LIGHT, 'sLight'],
    ['rápido abajo', DOWN | LIGHT, 'dLight'],
    ['rápido apuntando arriba', UP | LIGHT, 'nLight'],
    ['fuerte quieto', HEAVY, 'nSig'],
    ['fuerte de costado', LEFT | HEAVY, 'sSig'],
    ['fuerte abajo', DOWN | HEAVY, 'dSig'],
  ] as const)('en el piso, %s es %s', (_, input, expected) => {
    expect(attackWith(alone(), input).fighters[0].attack).toBe(expected)
  })

  it.each([
    ['rápido quieto', LIGHT, 'nAir'],
    ['rápido de costado', RIGHT | LIGHT, 'sAir'],
    ['rápido abajo', DOWN | LIGHT, 'dAir'],
    ['fuerte quieto', HEAVY, 'recovery'],
    ['fuerte de costado', RIGHT | HEAVY, 'recovery'],
    ['fuerte abajo', DOWN | HEAVY, 'groundPound'],
  ] as const)('en el aire, %s es %s', (_, input, expected) => {
    expect(attackWith(airborne(), input).fighters[0].attack).toBe(expected)
  })

  it('pegar de costado gira hacia ese lado', () => {
    expect(attackWith(alone(), LEFT | LIGHT).fighters[0].facing).toBe(-1)
  })
})
