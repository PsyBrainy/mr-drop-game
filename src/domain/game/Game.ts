export interface Game {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly coverUrl: string | null
  readonly engine: string
}

/**
 * Un juego dentro de un concurso: la unidad que el admin prende y apaga.
 */
export interface EventGame {
  readonly id: string
  readonly eventId: string
  readonly game: Game
  readonly isEnabled: boolean
  readonly position: number
  readonly maxPlays: number
  readonly config: Readonly<Record<string, unknown>>
}

export function sortByPosition(games: readonly EventGame[]): EventGame[] {
  return [...games].sort((a, b) => a.position - b.position || a.game.name.localeCompare(b.game.name))
}

/** `null` significa ilimitado (juego libre). */
export function playsLeft(eventGame: EventGame, playsUsed: number, unlimited = false): number | null {
  if (unlimited) return null
  return Math.max(0, eventGame.maxPlays - playsUsed)
}
