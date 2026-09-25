import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fx } from '../../../fight/sim/fixed'
import { MOVE_KEYS } from '../../../fight/sim/attack'
import { DODGE, HEAVY, LIGHT, NONE, RIGHT, type Input } from '../../../fight/sim/input'
import { initialState, type MatchState } from '../../../fight/sim/state'
import { step } from '../../../fight/sim/tick'
import { testWorld, withFighter } from '../../../fight/__tests__/harness'
import { allSoundNames, FIGHT_SOUNDS, soundCues, soundFor, soundUrl, type SoundCue } from '../fightSounds'

/**
 * Los sonidos se prueban con la sim de verdad: se juega y se mira qué habría
 * sonado. Qué se escucha no se puede probar acá; cuándo suena, sí.
 */
const world = testWorld()

function playCues(from: MatchState, inputs: ReadonlyArray<readonly [Input, Input]>): SoundCue[] {
  let state = from
  const cues: SoundCue[] = []
  for (const frame of inputs) {
    const next = step(state, frame, world)
    cues.push(...soundCues(state, next))
    state = next
  }
  return cues
}

const idle = (frames: number) => Array.from({ length: frames }, () => [NONE, NONE] as const)

describe('cuándo suena', () => {
  it('quieto no suena nada', () => {
    expect(playCues(initialState(world, 1), idle(60))).toEqual([])
  })

  it('un golpe suena una vez, del que pega', () => {
    const cues = playCues(initialState(world, 1), [[LIGHT, NONE], ...idle(30)])
    // Rápido quieto es el jab, que tiene sonido propio.
    expect(cues).toEqual([{ slot: 0, kind: 'nLight' }])
  })

  it('un golpe sin sonido propio suena como su familia', () => {
    const cues = playCues(initialState(world, 1), [[RIGHT | LIGHT, NONE], ...idle(30)])
    expect(cues).toEqual([{ slot: 0, kind: 'lightGround' }])
  })

  it('el fuerte y el esquive del otro jugador, con su sonido', () => {
    const cues = playCues(initialState(world, 1), [[NONE, HEAVY], ...idle(40), [NONE, DODGE], ...idle(30)])
    expect(cues).toEqual([
      { slot: 1, kind: 'heavy' },
      { slot: 1, kind: 'dodge' },
    ])
  })

  it('al que le pegan se queja', () => {
    // Pegados, de frente: el golpe rápido del 0 le llega al 1.
    let state = withFighter(initialState(world, 1), 0, { x: fx(400), facing: 1 })
    state = withFighter(state, 1, { x: fx(430), facing: -1 })
    const cues = playCues(state, [[LIGHT, NONE], ...idle(20)])
    expect(cues).toContainEqual({ slot: 0, kind: 'nLight' })
    expect(cues).toContainEqual({ slot: 1, kind: 'hurt' })
  })

  it('perder una vida suena distinto', () => {
    const falling = withFighter(initialState(world, 1), 1, { x: fx(-200), y: fx(900), grounded: false, state: 'air' })
    const cues = playCues(falling, idle(5))
    expect(cues).toContainEqual({ slot: 1, kind: 'ko' })
  })
})

describe('los archivos', () => {
  it('cada sonido configurado existe en public/sounds', () => {
    for (const name of allSoundNames()) expect(existsSync(`public${soundUrl(name)}`), name).toBe(true)
  })

  it('cada golpe suena en los dos personajes', () => {
    for (const slot of [0, 1] as const) {
      for (const move of MOVE_KEYS) {
        expect(FIGHT_SOUNDS[slot][soundFor(slot, move)]?.length, `${move} del ${slot}`).toBeGreaterThan(0)
      }
    }
  })

  it('los dos personajes esquivan con sonido', () => {
    for (const character of FIGHT_SOUNDS) expect(character.dodge?.length).toBeGreaterThan(0)
  })

  it('cada personaje tiene sus propios sonidos de golpe', () => {
    for (const character of FIGHT_SOUNDS) {
      expect(character.lightGround?.length).toBeGreaterThan(0)
      expect(character.heavy?.length).toBeGreaterThan(0)
    }
    const [uno, dos] = FIGHT_SOUNDS
    expect(uno.heavy).not.toEqual(dos.heavy)
  })
})
