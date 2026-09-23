import { domainError } from '../domain/shared/DomainError'
import { fightServerConfigured } from '../infrastructure/ws/WebSocketTransport'
import { fightLocalEnabled } from './flags'
import type { GameModule } from './GameModule'

/**
 * Qué clase de juego es, que es lo que decide cómo lo trata la app:
 *
 * - `score`: de a uno, termina con un puntaje. La app abre una sesión (gasta un
 *   intento), guarda el puntaje con `finish_game_session` y lo pone en el ranking.
 * - `match`: 1v1 contra otra persona. No tiene puntaje, tiene un ganador, y el
 *   resultado lo archiva psy-ws en `fight_matches`. La app NO abre sesión ni
 *   guarda nada: meter una pelea en `finish_game_session(score)` para que "entre"
 *   al ranking está prohibido (ver CLAUDE.md). Hasta que exista la validación de
 *   resultados (M4), una pelea se juega pero no rankea.
 */
export type GameKind = 'score' | 'match'

interface RegistryEntry {
  load: () => Promise<{ default: GameModule }>
  /** ancho / alto del canvas. La app necesita la forma antes de bajar el chunk. */
  aspectRatio: number
  /** Por defecto `score`. */
  kind?: GameKind
  /**
   * Sólo se puede montar desde el banco de pruebas. Un concurso no puede
   * ofrecerlo por más que exista la fila en `games`.
   */
  sandboxOnly?: boolean
  /**
   * El juego dibuja su propio HUD (en HTML, adentro de su mountPoint) y la app
   * no pone el genérico de puntaje. La pelea no tiene puntaje: tiene vidas,
   * resistencia y un nombre sobre cada personaje.
   */
  ownHud?: boolean
  /**
   * Si el juego depende de algo externo, por qué no se puede ofrecer ahora. La
   * pelea online sin servidor configurado no se conecta a ningún lado: mejor que
   * el admin lo vea en el panel que un jugador lo descubra en la cancha.
   */
  missing?: () => string | null
}

/**
 * Los slugs deben coincidir con `games.slug` en la base.
 * El import es dinámico: Kaplay y los sprites solo se descargan al entrar a jugar.
 */
const REGISTRY: Record<string, RegistryEntry> = {
  'mrdrop-run': { load: () => import('./modules/mrdropRun'), aspectRatio: 960 / 540 },
  // La pelea de verdad: 1v1 contra otra persona por psy-ws. Se ofrece en
  // concursos y en juego libre, pero sin ranking hasta que el resultado se
  // pueda validar re-simulando el replay.
  'fight-online': {
    load: () => import('./modules/fightOnline'),
    aspectRatio: 960 / 540,
    kind: 'match',
    ownHud: true,
    missing: () => (fightServerConfigured ? null : 'falta VITE_FIGHT_WS_URL'),
  },
  // Banco de pruebas de la pelea: dos jugadores en el mismo teclado. No es un
  // juego y no puede serlo — se juega de a dos en una sola máquina y no hay
  // resultado que valga. Sirve para sentir el ajuste, y sólo existe si se pide
  // con VITE_ENABLE_FIGHT_LOCAL: sin la variable no aparece ni en el sandbox.
  ...(fightLocalEnabled
    ? {
        'fight-local': {
          load: () => import('./modules/fightLocal'),
          aspectRatio: 960 / 540,
          kind: 'match',
          sandboxOnly: true,
          ownHud: true,
        } satisfies RegistryEntry,
      }
    : {}),
}

const DEFAULT_ASPECT_RATIO = 960 / 540

/**
 * ¿Se puede ofrecer en un concurso o en juego libre? Los de banco de pruebas no,
 * y tampoco los que dependen de algo que falta: el panel de admin los muestra
 * como no disponibles y el evento no los deja jugar, aunque alguien cargue la
 * fila en `games` y prenda el interruptor.
 */
export function isGameImplemented(slug: string): boolean {
  return unavailableReason(slug) === null
}

/** Por qué no se puede ofrecer, para el panel de admin. `null` si se puede. */
export function unavailableReason(slug: string): string | null {
  const entry = REGISTRY[slug]
  if (!entry) return 'sin módulo'
  if (entry.sandboxOnly) return 'sólo sandbox'
  return entry.missing?.() ?? null
}

/** Todo lo que el banco de pruebas puede montar, incluido lo que no es de concurso. */
export function implementedSlugs(): string[] {
  return Object.keys(REGISTRY)
}

export function gameKind(slug: string): GameKind {
  return REGISTRY[slug]?.kind ?? 'score'
}

/** ¿La app tiene que poner su HUD genérico encima? No, si el juego trae el suyo. */
export function gameHasOwnHud(slug: string): boolean {
  return REGISTRY[slug]?.ownHud === true
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
