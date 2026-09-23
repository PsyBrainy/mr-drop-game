/**
 * Geometría del escenario, en punto fijo. Es data: el tick la lee, no la decide.
 *
 * Un escenario de Brawlhalla es una plataforma flotando en el vacío: no hay
 * paredes, y el KO es salir de la pantalla (ring-out). Por eso el piso tiene
 * borde — caminar de más te tira — y por eso las zonas de muerte están bastante
 * más afuera que la plataforma: el espacio entre el borde y la zona de muerte es
 * donde pasa la mitad del juego, peleando por volver.
 */

import { fx, toPixels } from '../sim/fixed'
import type { Stage } from '../sim/world'

/**
 * El mundo mide 960x540 como el de MrDrop Run, así que la cámara y el canvas ya
 * tienen una forma conocida. La plataforma ocupa poco más de la mitad del ancho:
 * queda aire a los dos lados para que el ring-out sea una amenaza real y no una
 * rareza.
 */
export const SMALL_STAGE: Stage = {
  name: 'Playa',
  ground: { left: fx(200), right: fx(760), top: fx(420) },
  /**
   * Justo afuera de la pantalla de 960: se muere saliendo de cuadro, como
   * corresponde. La distancia del borde de la plataforma a la zona de muerte
   * (`sideGapPx`) tiene que ser algo que la cadena de saltos pueda recorrer, y
   * hay un test que lo pelea de verdad con la sim en vez de estimarlo.
   */
  blastLeft: fx(-40),
  blastRight: fx(1000),
  /** Arriba también mata, como en Brawlhalla: un golpe fuerte hacia el cielo es KO. */
  blastTop: fx(-400),
  blastBottom: fx(800),
  spawns: [
    { x: fx(380), y: fx(420) },
    { x: fx(580), y: fx(420) },
  ],
}

/**
 * Distancia del borde de la plataforma a la zona de muerte lateral: lo que hay
 * que poder recorrer en el aire para volver. Que se pueda es la invariante más
 * importante del escenario, y el test la verifica jugando la recuperación con la
 * sim, no estimándola con una fórmula.
 */
export function sideGapPx(stage: Stage): number {
  const left = toPixels(stage.ground.left - stage.blastLeft)
  const right = toPixels(stage.blastRight - stage.ground.right)
  return Math.min(left, right)
}

export function groundWidthPx(stage: Stage): number {
  return toPixels(stage.ground.right - stage.ground.left)
}
