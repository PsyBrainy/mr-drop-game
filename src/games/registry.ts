import { domainError } from '../domain/shared/DomainError'
import type { GameModule } from './GameModule'

interface RegistryEntry {
  load: () => Promise<{ default: GameModule }>
  /** ancho / alto del canvas. La app necesita la forma antes de bajar el chunk. */
  aspectRatio: number
}

/**
 * Los slugs deben coincidir con `games.slug` en la base.
 * El import es dinámico: Kaplay y los sprites solo se descargan al entrar a jugar.
 */
const REGISTRY: Record<string, RegistryEntry> = {
  'mrdrop-run': { load: () => import('./modules/mrdropRun'), aspectRatio: 960 / 540 },
}

const DEFAULT_ASPECT_RATIO = 960 / 540

export function isGameImplemented(slug: string): boolean {
  return slug in REGISTRY
}

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
