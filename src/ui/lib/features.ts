/**
 * Banderas de build. Se resuelven en tiempo de compilación, así que lo que
 * queda apagado no llega al bundle.
 */

/**
 * El sandbox deja jugar sin backend, sin código y sin gastar intentos. En
 * desarrollo va siempre; en un build de producción hay que pedirlo a mano con
 * `VITE_ENABLE_SANDBOX=true`, porque es una ruta de juego libre: sirve para
 * probar, pero conviene apagarla cuando el concurso esté en marcha.
 */
export const sandboxEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_SANDBOX === 'true'
