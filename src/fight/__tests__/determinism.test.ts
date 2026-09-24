import { describe, expect, it } from 'vitest'
import { decodeReplay, encodeReplay, runReplay, replayTrace } from '../replay/format'
import { formatHash, hashState } from '../sim/hash'
import { JUMP, LEFT, NONE, RIGHT } from '../sim/input'
import { initialState } from '../sim/state'
import { step } from '../sim/tick'
import { rngFromSeed, rngInt, rngNext } from '../sim/rng'
import { SIM_VERSION } from '../version'
import { hold, replayOf, testWorld } from './harness'

/**
 * Este archivo es la razón de existir del harness: todo el modelo de red se
 * apoya en que los mismos inputs produzcan el mismo estado en cualquier máquina.
 * `purity.test.ts` evita las causas conocidas de desync; estos tests verifican la
 * consecuencia, que es lo único que importa de verdad.
 */

const world = testWorld()

/** Una partida con de todo: caminar, saltar, frenar, cambiar de dirección. */
const sample = replayOf([
  ...hold(RIGHT, 20),
  ...hold(RIGHT | JUMP, 4),
  ...hold(LEFT, 30),
  ...hold(NONE, 10),
  ...hold(JUMP, 6),
  ...hold(LEFT | JUMP, 40),
  ...hold(NONE, 30),
])

describe('determinismo', () => {
  it('el mismo replay produce el mismo estado', () => {
    const first = runReplay(sample, world)
    const second = runReplay(sample, world)

    expect(hashState(first)).toBe(hashState(second))
    expect(first).toEqual(second)
  })

  /**
   * Lo que de verdad pasa en una partida: dos simulaciones separadas avanzando
   * en paralelo con los mismos inputs. Comparar frame por frame es lo que
   * permitiría ubicar el desync en el tick exacto, en vez de descubrirlo al final.
   */
  it('dos peers en paralelo coinciden en cada frame', () => {
    let peerA = initialState(world, sample.seed)
    let peerB = initialState(world, sample.seed)

    for (const frame of sample.frames) {
      peerA = step(peerA, frame, world)
      peerB = step(peerB, frame, world)
      expect(formatHash(hashState(peerA))).toBe(formatHash(hashState(peerB)))
    }

    expect(peerA.tick).toBe(sample.frames.length)
  })

  /**
   * El hash de una partida conocida, clavado a mano.
   *
   * No verifica que la física sea buena: verifica que no cambió sin que nadie lo
   * dijera. Si este test rompe, o hay un no-determinismo nuevo, o se cambió el
   * comportamiento de la sim a propósito — y en ese caso hay que subir
   * `SIM_VERSION`, porque los clientes con la versión vieja no pueden jugar
   * contra los nuevos ni los replays guardados se pueden seguir validando.
   */
  it('la partida de ejemplo termina en el hash conocido', () => {
    const final = runReplay(sample, world)

    expect(formatHash(hashState(final))).toBe('b1c691a1')
    expect(SIM_VERSION).toBe(3)
  })

  it('step no toca el estado que recibe', () => {
    const before = initialState(world, 7)
    const snapshot = hashState(before)

    step(before, [RIGHT | JUMP, LEFT], world)

    expect(hashState(before)).toBe(snapshot)
  })

  /**
   * Si el hash no distinguiera un 1/256 de píxel, no serviría para detectar
   * desyncs: justamente los que importan arrancan con una diferencia mínima que
   * después se amplifica.
   */
  it('el hash distingue estados que difieren en un subpíxel', () => {
    const base = initialState(world, 7)
    const moved = {
      ...base,
      fighters: [{ ...base.fighters[0], x: base.fighters[0].x + 1 }, base.fighters[1]] as const,
    }

    expect(hashState(moved)).not.toBe(hashState(base))
  })
})

describe('replay', () => {
  it('sobrevive a ir y volver del texto', () => {
    const decoded = decodeReplay(encodeReplay(sample))

    expect(decoded.seed).toBe(sample.seed)
    expect(decoded.frames).toEqual(sample.frames)
    expect(hashState(runReplay(decoded, world))).toBe(hashState(runReplay(sample, world)))
  })

  it('el texto es chico: 4 dígitos hex por frame', () => {
    // 200 frames de partida entran en 800 caracteres, así que un match de tres
    // minutos son ~43 KB de texto. Entra en una fila de Postgres sin pensarlo.
    expect(encodeReplay(sample).split(':')[2]).toHaveLength(sample.frames.length * 4)
  })

  it('rechaza un texto que no es un replay', () => {
    expect(() => decodeReplay('cualquier cosa')).toThrow(/replay ilegible/)
    expect(() => decodeReplay('v1:ff:abc')).toThrow(/múltiplo de 4/)
  })

  it('la traza tiene un estado por frame', () => {
    const trace = replayTrace(sample, world)

    expect(trace).toHaveLength(sample.frames.length)
    expect(trace[trace.length - 1]?.tick).toBe(sample.frames.length)
  })
})

describe('rng', () => {
  it('la secuencia es la misma siempre', () => {
    const sequence = (seed: number, count: number): number[] => {
      let state = rngFromSeed(seed)
      return Array.from({ length: count }, () => {
        state = rngNext(state)
        return state
      })
    }

    expect(sequence(12345, 5)).toEqual(sequence(12345, 5))
    expect(sequence(12345, 5)).not.toEqual(sequence(12346, 5))
  })

  it('el estado se queda en 32 bits sin signo', () => {
    let state = rngFromSeed(0xdeadbeef)
    for (let i = 0; i < 1000; i += 1) {
      state = rngNext(state)
      expect(Number.isInteger(state)).toBe(true)
      expect(state).toBeGreaterThanOrEqual(0)
      expect(state).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('la semilla 0 no deja el generador pegado', () => {
    // xorshift tiene al 0 como punto fijo: sin el reemplazo, sortear siempre
    // devolvería lo mismo y nadie lo notaría hasta ver una partida entera igual.
    expect(rngFromSeed(0)).not.toBe(0)
    expect(rngNext(rngFromSeed(0))).not.toBe(rngFromSeed(0))
  })

  it('rngInt devuelve el estado nuevo junto con el valor', () => {
    const first = rngInt(rngFromSeed(99), 6)
    const second = rngInt(first.state, 6)

    expect(first.value).toBeGreaterThanOrEqual(0)
    expect(first.value).toBeLessThan(6)
    expect(second.state).not.toBe(first.state)
  })
})
