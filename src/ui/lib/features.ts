/**
 * Banderas de build. Se resuelven en tiempo de compilación, así que lo que
 * queda apagado no llega al bundle.
 */

/**
 * Lo que quedó horneado en ESTE build. Vite reemplaza `import.meta.env.X` por
 * su valor al compilar: si acá dice "(sin definir)" es que la variable no
 * estaba presente cuando se corrió `npm run build`, por más que exista en el
 * panel del hosting o en un archivo que Vite no lee.
 */
export const sandboxFlagValue = import.meta.env.VITE_ENABLE_SANDBOX ?? '(sin definir)'

/**
 * El sandbox deja jugar sin backend, sin código y sin gastar intentos. En
 * desarrollo va siempre; en un build de producción hay que pedirlo a mano con
 * `VITE_ENABLE_SANDBOX=true`, porque es una ruta de juego libre: sirve para
 * probar, pero conviene apagarla cuando el concurso esté en marcha.
 *
 * Son comparaciones literales a propósito, y no un `.trim().toLowerCase()`:
 * Vite reemplaza `import.meta.env.X` por una constante al compilar, y solo si
 * la comparación es literal puede plegar todo a `false` y sacar el componente
 * del bundle. Normalizar en runtime lo dejaría adentro de todos los builds.
 * La lista cubre las formas en que los paneles de hosting suelen guardar un sí.
 */
const flag = import.meta.env.VITE_ENABLE_SANDBOX

export const sandboxEnabled =
  import.meta.env.DEV
  || flag === 'true'
  || flag === 'TRUE'
  || flag === 'True'
  || flag === '1'
  || flag === 'yes'
  || flag === 'on'
