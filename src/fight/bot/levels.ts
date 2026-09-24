/**
 * Los niveles del bot, sin el bot. Lo usa la app para elegir antes de entrar,
 * y así la página no se trae la sim ni el motor sólo para mostrar tres botones.
 */

export type BotLevel = 'easy' | 'medium' | 'hard'

export const BOT_LEVEL_ORDER: readonly BotLevel[] = ['easy', 'medium', 'hard']

/** Cómo se llama cada nivel en pantalla. */
export const BOT_LEVEL_LABELS: Record<BotLevel, string> = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
}

/** Un nivel si `value` es uno válido; `null` si no. */
export function botLevelOf(value: unknown): BotLevel | null {
  return typeof value === 'string' && (BOT_LEVEL_ORDER as readonly string[]).includes(value)
    ? (value as BotLevel)
    : null
}
