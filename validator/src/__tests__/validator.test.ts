import { describe, expect, it } from 'vitest'
import { bytesToHex } from '../../../src/fight/bytes'
import { botStep, createBot } from '../../../src/fight/bot/bot'
import { ONLINE_WORLD } from '../../../src/fight/data/world'
import { initialState } from '../../../src/fight/sim/state'
import { step } from '../../../src/fight/sim/tick'
import { SIM_VERSION } from '../../../src/fight/version'
import { pollSeconds, readDatabaseConfig } from '../config'
import { validatePending, type MatchStore, type PendingMatch, type StoredVerdict } from '../worker'

describe('la base', () => {
  it('lee la URL de psy-ws tal cual (JDBC + clave aparte)', () => {
    const config = readDatabaseConfig({
      SUPABASE_DB_URL: 'jdbc:postgresql://aws-0-sa-east-1.pooler.supabase.com:5432/postgres?user=postgres.abc',
      SUPABASE_DB_PASSWORD: 'secreta',
    })
    expect(config).toEqual({
      host: 'aws-0-sa-east-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.abc',
      password: 'secreta',
      ssl: true,
    })
  })

  it('o una URL de Postgres común', () => {
    const config = readDatabaseConfig({ DATABASE_URL: 'postgres://yo:cl%40ve@localhost:5433/mrdrop?sslmode=disable' })
    expect(config).toMatchObject({ host: 'localhost', port: 5433, database: 'mrdrop', user: 'yo', password: 'cl@ve', ssl: false })
  })

  it('sin URL, o sin usuario, no arranca: mejor un error claro que conectarse a cualquier lado', () => {
    expect(() => readDatabaseConfig({})).toThrow(/DATABASE_URL/)
    expect(() => readDatabaseConfig({ DATABASE_URL: 'postgres://host/db' })).toThrow(/usuario/)
    expect(() => readDatabaseConfig({ DATABASE_URL: 'mysql://a:b@host/db' })).toThrow(/Postgres/)
  })

  it('cada cuánto mira: 15 segundos, salvo que se diga otra cosa', () => {
    expect(pollSeconds({})).toBe(15)
    expect(pollSeconds({ VALIDATOR_POLL_SECONDS: '5' })).toBe(5)
    expect(pollSeconds({ VALIDATOR_POLL_SECONDS: 'nada' })).toBe(15)
  })
})

/** Una partida de verdad entre dos bots, guardada como la guarda psy-ws. */
function realMatch(id: string, seed: number): PendingMatch {
  let state = initialState(ONLINE_WORLD, seed)
  let a = createBot(seed, 'medium')
  let b = createBot(seed + 1, 'easy')
  const bytes: number[] = []
  while (!state.over) {
    const da = botStep(a, state, 0, ONLINE_WORLD)
    const db = botStep(b, state, 1, ONLINE_WORLD)
    a = da.bot
    b = db.bot
    bytes.push(da.input, db.input)
    state = step(state, [da.input, db.input], ONLINE_WORLD)
  }
  return {
    id,
    seed,
    winner: state.winner,
    ending: 'decided',
    frames: bytes.length / 2,
    replay: bytesToHex(bytes),
    simVersion: SIM_VERSION,
  }
}

function memoryStore(rows: PendingMatch[]) {
  const saved = new Map<string, { verdict: StoredVerdict; reason: string | null; winner: 0 | 1 | null }>()
  const store: MatchStore = {
    pending: async (maxSimVersion, limit) =>
      rows
        .filter((row) => !saved.has(row.id) && (row.simVersion ?? 0) <= maxSimVersion)
        .slice(0, limit),
    save: async (id, verdict, reason, winner) => void saved.set(id, { verdict, reason, winner }),
  }
  return { store, saved }
}

describe('una pasada del validador', () => {
  const real = realMatch('real', 5)

  it('confirma las reales y rechaza las truchas', async () => {
    const lie: PendingMatch = { ...real, id: 'trucha', winner: real.winner === 0 ? 1 : 0 }
    const { store, saved } = memoryStore([real, lie])
    const report = await validatePending(store, ONLINE_WORLD, SIM_VERSION, 10)
    expect(report).toEqual({ checked: 2, ok: 1, rejected: 1 })
    expect(saved.get('real')).toEqual({ verdict: 'ok', reason: null, winner: real.winner })
    expect(saved.get('trucha')?.verdict).toBe('mismatch')
  })

  it('una fila rota no frena la cola', async () => {
    const broken: PendingMatch = { ...real, id: 'rota', replay: 'xyz', frames: 1 }
    const { store, saved } = memoryStore([broken, real])
    await validatePending(store, ONLINE_WORLD, SIM_VERSION, 10)
    expect(saved.get('rota')?.verdict).toBe('unplayable')
    expect(saved.get('real')?.verdict).toBe('ok')
  })

  it('de a lotes: lo que no entra queda para la próxima', async () => {
    const { store, saved } = memoryStore([real, { ...real, id: 'otra' }, { ...real, id: 'tercera' }])
    expect((await validatePending(store, ONLINE_WORLD, SIM_VERSION, 2)).checked).toBe(2)
    expect(saved.size).toBe(2)
    expect((await validatePending(store, ONLINE_WORLD, SIM_VERSION, 2)).checked).toBe(1)
  })
})
