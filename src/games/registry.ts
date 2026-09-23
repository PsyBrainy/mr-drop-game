import { domainError } from '../domain/shared/DomainError'
import type { GameModule } from './GameModule'

interface RegistryEntry {
  load: () => Promise<{ default: GameModule }>
  /** ancho / alto del canvas. La app necesita la forma antes de bajar el chunk. */
  aspectRatio: number
  /**
   * Sólo se puede montar desde el banco de pruebas. Un concurso no puede
   * ofrecerlo por más que exista la fila en `games`.
   */
  sandboxOnly?: boolean
}

/**
 * Los slugs deben coincidir con `games.slug` en la base.
 * El import es dinámico: Kaplay y los sprites solo se descargan al entrar a jugar.
 */
const REGISTRY: Record<string, RegistryEntry> = {
  'mrdrop-run': { load: () => import('./modules/mrdropRun'), aspectRatio: 960 / 540 },
  // Banco de pruebas de la pelea: dos jugadores en el mismo teclado. No es un
  // juego de concurso y no puede serlo — se juega de a dos en una sola máquina,
  // no da puntaje y no hay ranking que le sirva. Existe para sentir el ajuste
  // mientras se construye el motor. El juego de verdad es 1v1 online y llega con
  // el contrato `MatchModule`.
  'fight-local': {
    load: () => import('./modules/fightLocal'),
    aspectRatio: 960 / 540,
    sandboxOnly: true,
  },
}

const DEFAULT_ASPECT_RATIO = 960 / 540

/**
 * ¿Se puede ofrecer en un concurso o en juego libre? Los de banco de pruebas no:
 * el panel de admin los muestra como no implementados y el evento no los deja
 * jugar, aunque alguien cargue la fila en `games`.
 */
export function isGameImplemented(slug: string): boolean {
  const entry = REGISTRY[slug]
  return entry !== undefined && entry.sandboxOnly !== true
}

/** Todo lo que el banco de pruebas puede montar, incluido lo que no es de concurso. */
export function implementedSlugs(): string[] {
  return Object.keys(REGISTRY)
}

export function gameAspectRatio(slug: string): number {
  return REGISTRY[slug]?.aspectRatio ?? DEFAULT_ASPECT_RATIO
}

export async function loadGameModule(slug: string): Promise<GameModule> {
  const entry = REGISTRY[slug]
  if (!entry) throw domainError('GAME_NOT_IMPLEMENTED')
  const module = await entry.load()
  return module.default
}
