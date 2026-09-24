/**
 * De dónde sale la base. Acepta dos formas, para poder reusar el archivo de
 * variables de psy-ws tal cual (`docker run --env-file ~/psy-ws.env`):
 *
 * - `DATABASE_URL=postgres://usuario:clave@host:puerto/base`
 * - `SUPABASE_DB_URL=jdbc:postgresql://host:puerto/base?user=usuario` más
 *   `SUPABASE_DB_PASSWORD`, que es como la tiene configurada psy-ws.
 */
export interface DatabaseConfig {
  readonly host: string
  readonly port: number
  readonly database: string
  readonly user: string
  readonly password: string
  /** Supabase pide SSL; se apaga sólo si la URL dice `sslmode=disable` (una base local). */
  readonly ssl: boolean
}

export function readDatabaseConfig(env: Readonly<Record<string, string | undefined>>): DatabaseConfig {
  const raw = env['DATABASE_URL'] ?? env['SUPABASE_DB_URL']
  if (!raw) throw new Error('Falta DATABASE_URL (o SUPABASE_DB_URL + SUPABASE_DB_PASSWORD, como en psy-ws)')

  // jdbc:postgresql://… → postgresql://…, que `URL` sabe leer.
  const url = new URL(raw.replace(/^jdbc:/, ''))
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`La URL de la base tiene que ser de Postgres y es ${url.protocol}`)
  }

  const user = decodeURIComponent(url.username) || url.searchParams.get('user') || ''
  const password =
    env['SUPABASE_DB_PASSWORD'] ?? (decodeURIComponent(url.password) || url.searchParams.get('password') || '')
  if (!user) throw new Error('La URL de la base no dice el usuario (ni user@host ni ?user=)')

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.replace(/^\//, '') || 'postgres',
    user,
    password,
    ssl: url.searchParams.get('sslmode') !== 'disable',
  }
}

/** Cada cuántos segundos se buscan partidas nuevas. */
export function pollSeconds(env: Readonly<Record<string, string | undefined>>): number {
  const value = Number(env['VALIDATOR_POLL_SECONDS'] ?? '15')
  return Number.isFinite(value) && value >= 1 ? value : 15
}
