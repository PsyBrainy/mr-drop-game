/**
 * xorshift32 con semilla. La semilla la fija el servidor cuando arma el match y
 * viaja en el mensaje de arranque, así que los dos clientes sortean lo mismo en
 * el mismo orden. Toda aleatoriedad del juego es reproducible o no existe: sin
 * esto, un replay no vuelve a producir la misma partida y se cae la validación
 * del resultado.
 *
 * Es de 32 bits a propósito: `^`, `<<` y `>>>` operan sobre enteros de 32 bits
 * en cualquier motor de JS, así que la secuencia es idéntica en todos. Un PRNG
 * de 53 bits armado con multiplicaciones flotantes no daría esa garantía.
 */

/** El estado del generador es un solo entero sin signo. Va adentro de MatchState. */
export type RngState = number

/** El 0 es punto fijo de xorshift (se queda en 0 para siempre), así que se descarta. */
export function rngFromSeed(seed: number): RngState {
  const normalized = (seed | 0) >>> 0
  return normalized === 0 ? 0x9e3779b9 : normalized
}

export function rngNext(state: RngState): RngState {
  let x = state
  x ^= (x << 13) >>> 0
  x >>>= 0
  x ^= x >>> 17
  x ^= (x << 5) >>> 0
  return x >>> 0
}

/**
 * Entero en [0, bound). Con módulo, que sesga los valores altos cuando `bound`
 * no divide a 2^32 — para elegir un spawn o una variante de animación ese sesgo
 * (del orden de 1 en 10^7) no significa nada, y a cambio el cálculo es exacto en
 * 32 bits. Si algún día se sortea algo competitivo, acá va rechazo por rango.
 */
export function rngInt(state: RngState, bound: number): { state: RngState; value: number } {
  const next = rngNext(state)
  return { state: next, value: next % bound }
}
