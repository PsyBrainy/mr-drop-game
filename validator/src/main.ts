/**
 * El validador de peleas. Corre al lado de psy-ws (en la misma VM, en su propio
 * contenedor): cada tanto busca en `fight_matches` las partidas que terminaron
 * y nadie validó, las vuelve a jugar con la MISMA sim del front, y anota si el
 * resultado es real. Sólo las confirmadas entran al ranking.
 *
 * Por qué un proceso aparte y no psy-ws: la sim está escrita en TypeScript, y
 * tiene que ser exactamente la misma que corrió en los navegadores. Reescribirla
 * en Kotlin sería tener dos motores que tarde o temprano no coinciden.
 */

import pg from 'pg'
import { ONLINE_WORLD } from '../../src/fight/data/world'
import { SIM_VERSION } from '../../src/fight/version'
import { pollSeconds, readDatabaseConfig } from './config'
import { validatePending, type MatchStore, type PendingMatch, type StoredVerdict } from './worker'

const BATCH = 25

const config = readDatabaseConfig(process.env)
const pool = new pg.Pool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  ssl: config.ssl ? { rejectUnauthorized: false } : false,
  max: 2,
})

const store: MatchStore = {
  async pending(maxSimVersion, limit) {
    const result = await pool.query(
      `select id, seed, winner, ending, frames, replay, sim_version
         from public.fight_matches
        where verdict is null
          and ending in ('decided', 'forfeit')
          and (sim_version is null or sim_version <= $1)
        order by finished_at
        limit $2`,
      [maxSimVersion, limit],
    )
    return result.rows.map(
      (row): PendingMatch => ({
        id: String(row.id),
        seed: Number(row.seed),
        winner: row.winner === null ? null : (Number(row.winner) as 0 | 1),
        ending: row.ending,
        frames: Number(row.frames),
        replay: String(row.replay),
        simVersion: row.sim_version === null ? null : Number(row.sim_version),
      }),
    )
  },
  async save(id, verdict: StoredVerdict, reason, winner) {
    await pool.query(
      `update public.fight_matches
          set verdict = $2, verdict_reason = $3, validated_winner = $4,
              validated = ($2 = 'ok'), validated_at = now()
        where id = $1 and verdict is null`,
      [id, verdict, reason, winner],
    )
  },
}

const log = (line: string): void => console.log(`[validador] ${line}`)
let stopping = false
let timer: ReturnType<typeof setTimeout> | null = null

async function loop(): Promise<void> {
  if (stopping) return
  let full = false
  try {
    const report = await validatePending(store, ONLINE_WORLD, SIM_VERSION, BATCH, log)
    if (report.checked > 0) log(`${report.checked} revisadas: ${report.ok} confirmadas, ${report.rejected} rechazadas`)
    full = report.checked === BATCH
  } catch (error) {
    // La base se cayó un rato, o el pooler cortó: se reintenta en la próxima vuelta.
    log(`error: ${String(error)}`)
  }
  // Si vino un lote lleno quedan más: se sigue ya. Si no, se espera.
  timer = setTimeout(() => void loop(), full ? 0 : pollSeconds(process.env) * 1000)
}

function stop(): void {
  stopping = true
  if (timer) clearTimeout(timer)
  void pool.end().then(() => process.exit(0))
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

log(`arrancó · sim v${SIM_VERSION} · base ${config.host}`)
void loop()
