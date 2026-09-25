import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OSO } from '../../../fight/data/characters/oso'
import { MOVE_KEYS, type MoveKey } from '../../../fight/sim/attack'
import { fx } from '../../../fight/sim/fixed'
import { initialState, type FighterStateName } from '../../../fight/sim/state'
import { DEFAULT_RULES, type World } from '../../../fight/sim/world'
import { SMALL_STAGE } from '../../../fight/data/stage'
import {
  ANIMS,
  expectedLength,
  FEET_Y,
  FRAME_PX,
  IMPACT_POSE,
  MOVE_ANIM,
  ORIGIN_X,
  POSE_BY_FRAME,
  SHEETS,
  SKINS,
  spriteFrame,
  spriteSrc,
} from '../fightSprites.config'

/**
 * Los sprites no deciden nada, pero pueden mentir: un golpe que pega antes de
 * que se vea el puño estirado se siente injusto aunque el frame data sea
 * perfecto. Estos tests cruzan el timing del dibujo contra el de la sim, y las
 * hojas contra los PNG de verdad.
 */

const world: World = { stage: SMALL_STAGE, tuning: [OSO, OSO], rules: DEFAULT_RULES }
const MOVES: readonly MoveKey[] = MOVE_KEYS

describe('el timing de los dibujos', () => {
  it.each([...MOVES, 'dodge' as const])('la tabla de %s dura lo mismo que el movimiento', (key) => {
    expect(POSE_BY_FRAME[key]).toHaveLength(expectedLength(key, OSO))
  })

  it.each(MOVES)('%s muestra el impacto justo en el primer frame activo', (key) => {
    const table = POSE_BY_FRAME[key]
    const { startup, active } = OSO.moves[key]
    // Ni antes (el puño llegaría antes que la caja) ni después (la caja pegaría
    // mientras el dibujo todavía está cargando el brazo).
    expect(table[startup - 1]).not.toBe(IMPACT_POSE[key])
    expect(table[startup]).toBe(IMPACT_POSE[key])
    // Y el impacto no se ve después de que la caja se apagó.
    for (let f = startup + active; f < table.length; f++) {
      expect(table[f]).not.toBe(IMPACT_POSE[key])
    }
  })

  it('las tablas sólo avanzan: un golpe no vuelve a una pose anterior', () => {
    for (const key of [...MOVES, 'dodge' as const]) {
      const table = POSE_BY_FRAME[key]
      for (let f = 1; f < table.length; f++) expect(table[f]).toBeGreaterThanOrEqual(table[f - 1] ?? 0)
    }
  })

  it('toda pose pedida existe en su hoja', () => {
    for (const key of MOVES) {
      for (const pose of POSE_BY_FRAME[key]) expect(pose).toBeLessThan(SHEETS[MOVE_ANIM[key]].frames)
    }
    for (const pose of POSE_BY_FRAME.dodge) expect(pose).toBeLessThan(SHEETS.dodge.frames)
  })
})

describe('qué dibujo corresponde a cada estado', () => {
  const base = initialState(world, 1).fighters[0]
  const states: FighterStateName[] = ['idle', 'walk', 'air', 'land', 'attack', 'dodge', 'cling', 'hitstun', 'dead']

  it('nunca pide un frame que la hoja no tiene', () => {
    for (const state of states) {
      for (const attack of [null, ...MOVES]) {
        for (const vy of [fx(-10), fx(0), fx(10)]) {
          for (const vx of [fx(-20), fx(0), fx(20)]) {
            for (let stateFrames = 0; stateFrames < 200; stateFrames++) {
              const shown = spriteFrame({ ...base, state, attack, vx, vy, stateFrames })
              expect(shown.frame).toBeGreaterThanOrEqual(0)
              expect(shown.frame).toBeLessThan(SHEETS[shown.anim].frames)
            }
          }
        }
      }
    }
  })

  it('espeja al que mira a la izquierda, salvo colgado de la pared', () => {
    expect(spriteFrame({ ...base, facing: 1 }).flip).toBe(false)
    expect(spriteFrame({ ...base, facing: -1 }).flip).toBe(true)
    // Colgado mira para afuera (de ahí salta) y el dibujo tiene la pared adelante.
    expect(spriteFrame({ ...base, state: 'cling', facing: -1 }).flip).toBe(false)
  })

  it('subir y bajar son dibujos distintos', () => {
    const up = spriteFrame({ ...base, state: 'air', vy: fx(-8) })
    const down = spriteFrame({ ...base, state: 'air', vy: fx(8) })
    expect(up.frame).toBeLessThan(2)
    expect(down.frame).toBeGreaterThanOrEqual(2)
  })

  it('un golpe flojo es "me pegaron"; uno que te manda lejos es salir volando', () => {
    expect(spriteFrame({ ...base, state: 'hitstun', vx: fx(4), vy: fx(-3) }).anim).toBe('hurt')
    expect(spriteFrame({ ...base, state: 'hitstun', vx: fx(12), vy: fx(-10) }).anim).toBe('ko')
  })
})

describe('las hojas del rasta', () => {
  function pngSize(path: string): { width: number; height: number } {
    const buffer = readFileSync(`public${path}`)
    expect(buffer.subarray(1, 4).toString()).toBe('PNG')
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  const all = SKINS.flatMap((skin) => ANIMS.map((anim) => ({ skin, anim, src: spriteSrc(skin, anim) })))

  it.each(all)('$src se corta en frames exactos y entra en una GPU de celular', ({ anim, src }) => {
    const { width, height } = pngSize(src)
    expect(width).toBe(SHEETS[anim].frames * FRAME_PX)
    expect(height).toBe(FRAME_PX)
    expect(Math.max(width, height)).toBeLessThanOrEqual(2048)
  })

  it('el origen de los pies cae adentro del frame', () => {
    expect(ORIGIN_X).toBeGreaterThan(0)
    expect(ORIGIN_X).toBeLessThan(FRAME_PX)
    expect(FEET_Y).toBeLessThanOrEqual(FRAME_PX)
  })

  it('las dos pieles juntas no se comen la VRAM de un teléfono', () => {
    const bytes = all.reduce((total, { src }) => {
      const { width, height } = pngSize(src)
      return total + width * height * 4
    }, 0)
    // 2 pieles x 55 frames de 192x192 son ~16 MB; el techo deja lugar al escenario.
    expect(bytes / 1024 / 1024).toBeLessThan(20)
  })
})
