/**
 * Punto fijo: todo entero, 1/256 de píxel.
 *
 * El float se queda en la vista, para interpolar. La sim no puede usarlo porque
 * el mismo estado tiene que salir bit a bit igual en dos navegadores distintos y
 * en Node. IEEE754 garantiza `+ - * /` y `sqrt` exactos entre plataformas, así
 * que un float "alcanzaría" — pero el error de redondeo acumulado a 60 ticks por
 * segundo hace que dos peers que arrancaron iguales terminen a medio píxel de
 * distancia, y medio píxel decide si un golpe entra o no. Con enteros no hay
 * error que acumular: o es el mismo número, o hay un bug.
 *
 * 1/256 alcanza de sobra: el subpíxel más chico que necesita el juego es la
 * aceleración de un frame, y a 60 fps eso es del orden de 1/16 de píxel.
 */

/** Un entero que representa `valor / 256`. El tipo es documentación: TS no lo distingue de un number. */
export type Fx = number

export const FX_BITS = 8
export const FX_ONE = 1 << FX_BITS
export const FX_ZERO = 0

/**
 * Convierte píxeles a punto fijo. Es para escribir los archivos de `data/` a
 * mano: `fx(3.5)` se lee mucho mejor que `896`. No se usa adentro del tick,
 * donde todo es ya Fx.
 */
export function fx(pixels: number): Fx {
  return Math.round(pixels * FX_ONE)
}

/** Fracción exacta, para los números que no son redondos en píxeles. */
export function fxRatio(numerator: number, denominator: number): Fx {
  return Math.round((numerator * FX_ONE) / denominator)
}

/**
 * Se trunca hacia cero (y no con `floor`) a propósito: `trunc` es simétrica
 * respecto del cero, así que caminar para la izquierda redondea igual que
 * caminar para la derecha. Con `floor`, el lado izquierdo perdería un
 * 1/256 de píxel por operación y el personaje aceleraría distinto según para
 * dónde mira — en un juego de pelea eso es un desbalance real, no un detalle.
 *
 * Y nunca `(a * b) >> FX_BITS`: los operadores bit a bit truncan a 32 bits, y el
 * producto de dos posiciones se pasa de 2^31 enseguida (una posición de 3000 px
 * son 768.000 en Fx; el cuadrado, 5,9e11). Con `Math.trunc` sobre una división
 * el cálculo es exacto hasta 2^53, que no lo vamos a alcanzar.
 */
export function fxMul(a: Fx, b: Fx): Fx {
  return Math.trunc((a * b) / FX_ONE)
}

export function fxDiv(a: Fx, b: Fx): Fx {
  return Math.trunc((a * FX_ONE) / b)
}

export function fxAbs(a: Fx): Fx {
  return a < 0 ? -a : a
}

/** -1, 0 o 1. Sin `Math.sign`, que devuelve -0 y ensuciaría el hash del estado. */
export function fxSign(a: Fx): -1 | 0 | 1 {
  if (a > 0) return 1
  if (a < 0) return -1
  return 0
}

export function fxClamp(value: Fx, min: Fx, max: Fx): Fx {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Acerca `value` a `target` a lo sumo `step`, sin pasarse. Es la fricción y la
 * aceleración: las dos son "movete hacia esta velocidad de a poco".
 */
export function fxApproach(value: Fx, target: Fx, step: Fx): Fx {
  if (value < target) return Math.min(target, value + step)
  if (value > target) return Math.max(target, value - step)
  return value
}

/** Sólo para la vista. Nada de la sim puede tocar el resultado de esto. */
export function toPixels(value: Fx): number {
  return value / FX_ONE
}
