/**
 * Contrato entre la app y un juego. La app no sabe nada del motor:
 * monta el módulo, escucha el puntaje y recibe el final.
 * Cualquier juego (Kaplay, canvas puro, DOM) que cumpla esto es enchufable.
 *
 * REGLA IMPORTANTE: los juegos no dibujan texto adentro del canvas.
 * Kaplay cachea el atlas de fuente en `fontAtlases`, un objeto a nivel de
 * módulo con la clave del nombre de la fuente, pero la textura se crea contra
 * el contexto WebGL de la instancia que la pidió primero. Al reiniciar, la
 * instancia nueva encuentra el caché y reutiliza una textura de un contexto ya
 * muerto: el texto deja de aparecer mientras los sprites siguen andando. No hay
 * API para limpiar ese caché.
 *
 * Por eso el HUD y los carteles se mandan como datos (`onScoreChange`,
 * `onStatusChange`, `onGameOver`) y los dibuja la app en HTML encima del canvas.
 * Sale gratis: el texto queda nítido, se puede clickear y no cuesta los 16 MB
 * de VRAM que ocupa el atlas de 2048x2048 de Kaplay.
 */

/** Valores sueltos para el HUD, en orden. La app los muestra como etiquetas. */
export type GameStatus = Readonly<Record<string, string | number>>

export interface GameContext {
  /** Nodo donde el juego dibuja. Ya viene dimensionado por la app. */
  readonly mountPoint: HTMLElement
  /** Config por evento (event_games.config), definida desde el panel de admin. */
  readonly config: Readonly<Record<string, unknown>>
  /** Puntaje en vivo, para el HUD de la app. */
  onScoreChange(score: number): void
  /** Otros datos del HUD: tiempo restante, vidas, lo que el juego quiera. */
  onStatusChange(status: GameStatus): void
  /**
   * Fin de partida. La app persiste el score con finish_game_session y muestra
   * el cartel del final. Si el payload trae `message`, lo usa como título.
   */
  onGameOver(score: number, payload?: Record<string, unknown>): void
}

export interface GameHandle {
  /** Libera canvas, listeners y loops. Se llama siempre al desmontar. */
  destroy(): void
}

export interface GameModule {
  readonly slug: string
  readonly name: string
  readonly howToPlay: string
  mount(context: GameContext): GameHandle | Promise<GameHandle>
}

export function readNumber(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = config[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
