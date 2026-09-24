import { describe, expect, it } from 'vitest'
import { bytesToHex } from '../bytes'
import { botStep, createBot } from '../bot/bot'
import { ONLINE_WORLD } from '../data/world'
import { validateMatch, type ArchivedMatch } from '../replay/validate'
import type { Input } from '../sim/input'
import { initialState, type PlayerIndex } from '../sim/state'
import { step, TICKS_PER_SECOND } from '../sim/tick'
import { SIM_VERSION } from '../version'

/**
 * El validador se prueba con partidas de verdad: dos bots pelean con la sim, se
 * guarda el log como lo guarda el servidor, y se lo vuelve a jugar. Después se
 * lo truchea de todas las formas en que alguien podría intentarlo.
 */
const world = ONLINE_WORLD

interface Played {
  readonly log: string
  readonly winner: PlayerIndex | null
  readonly frames: number
}

/** Una partida entre bots, más `extra` frames después del final (los inputs viajan adelantados). */
function playMatch(seed: number, extra = 4, stopAt = Infinity): Played {
  let state = initialState(world, seed)
  let a = createBot(seed, 'medium')
  let b = createBot(seed + 99, 'easy')
  const frames: [Input, Input][] = []
  let after = 0
  for (let frame = 0; frame < TICKS_PER_SECOND * 400 && after < extra && frame < stopAt; frame += 1) {
    const da = botStep(a, state, 0, world)
    const db = botStep(b, state, 1, world)
    a = da.bot
    b = db.bot
    frames.push([da.input, db.input])
    state = step(state, [da.input, db.input], world)
    if (state.over) after += 1
  }
  return { log: frames.map(([one, two]) => bytesToHex([one, two])).join(''), winner: state.winner, frames: frames.length }
}

function archived(played: Played, patch: Partial<ArchivedMatch> = {}): ArchivedMatch {
  return {
    seed: 42,
    winner: played.winner,
    ending: 'decided',
    frames: played.frames,
    replay: played.log,
    simVersion: SIM_VERSION,
    ...patch,
  }
}

const match = playMatch(42)

describe('validar una partida', () => {
  it('la partida es de verdad: terminó con un ganador', () => {
    expect(match.winner).not.toBeNull()
  })

  it('un resultado real se confirma', () => {
    expect(validateMatch(archived(match), world)).toEqual({ kind: 'ok', winner: match.winner })
  })

  it('si dicen que ganó el otro, no cuenta', () => {
    const lie = archived(match, { winner: match.winner === 0 ? 1 : 0 })
    expect(validateMatch(lie, world).kind).toBe('mismatch')
  })

  it('si reemplazan el log por otro, el resultado que decían deja de valer', () => {
    // Nadie apretó nada: la pelea no termina, así que "ganó fulano" es mentira.
    const empty = archived(match, { replay: '0000'.repeat(match.frames) })
    expect(validateMatch(empty, world).kind).toBe('mismatch')
    // Y el log de otra partida no confirma el ganador de ésta, salvo casualidad.
    const other = playMatch(7)
    const swapped = archived({ ...other, winner: other.winner === 0 ? 1 : 0 })
    expect(validateMatch(swapped, world).kind).toBe('mismatch')
  })

  it('un "terminó" con un log que no llega al final no cuenta', () => {
    const cut = playMatch(42, 0, 600)
    expect(validateMatch(archived(cut, { winner: 0 }), world).kind).toBe('mismatch')
  })

  it('el log tiene que tener los frames que dice la fila', () => {
    expect(validateMatch(archived(match, { frames: match.frames + 1 }), world).kind).toBe('mismatch')
  })

  it('un log ilegible no se valida', () => {
    expect(validateMatch(archived(match, { replay: 'zz00', frames: 1 }), world).kind).toBe('unplayable')
    expect(validateMatch(archived(match, { replay: '000', frames: 1 }), world).kind).toBe('unplayable')
  })
})

describe('abandonos', () => {
  it('irse en el medio: gana el que se quedó', () => {
    const half = playMatch(42, 0, 500)
    const left = archived(half, { ending: 'forfeit', winner: 1 })
    expect(validateMatch(left, world)).toEqual({ kind: 'ok', winner: 1 })
  })

  it('irse después de ganar no le regala la victoria al otro', () => {
    const loser = match.winner === 0 ? 1 : 0
    const left = archived(match, { ending: 'forfeit', winner: loser })
    expect(validateMatch(left, world)).toEqual({ kind: 'ok', winner: match.winner })
  })
})

describe('lo que no se puede validar', () => {
  it('sin resultado (desync, desacuerdo, abandonada) no hay nada que confirmar', () => {
    for (const ending of ['desync', 'disagreement', 'abandoned'] as const) {
      expect(validateMatch(archived(match, { ending }), world).kind).toBe('unplayable')
    }
  })

  it('una partida de una sim vieja no se puede validar con la de hoy', () => {
    expect(validateMatch(archived(match, { simVersion: SIM_VERSION - 1 }), world).kind).toBe('unplayable')
    expect(validateMatch(archived(match, { simVersion: null }), world).kind).toBe('unplayable')
  })

  it('una de una sim más nueva la deja para el validador actualizado', () => {
    expect(validateMatch(archived(match, { simVersion: SIM_VERSION + 1 }), world)).toEqual({ kind: 'later' })
  })
})
