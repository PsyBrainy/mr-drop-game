/**
 * El reloj de la simulación: 60 ticks por segundo fijos, pase lo que pase con
 * los FPS del navegador.
 *
 * Vive afuera de `sim/` porque mira la hora y pide frames, dos cosas que la sim
 * tiene prohibidas. Y vive afuera de Kaplay porque el loop de Kaplay corre a los
 * FPS de la pantalla: a 144 Hz un ataque de 3 frames duraría menos de la mitad
 * que a 60, y dos jugadores con monitores distintos jugarían a juegos distintos.
 * Acá la vista dibuja a los FPS que dé el navegador y la sim avanza siempre a 60.
 *
 * Limitación conocida: `requestAnimationFrame` se frena cuando la pestaña queda
 * de fondo, así que en local el match se pausa (que es lo que uno quiere) pero
 * en red eso sería un desync. La versión online mueve esto a un Web Worker y el
 * servidor decide qué pasa con el que se fue (timeout o forfeit). Es trabajo de
 * M3, no de acá.
 */

export interface FixedClock {
  /**
   * Cuánto del próximo tick ya transcurrió, de 0 a 1. La vista interpola con
   * esto: sin interpolar, a 144 Hz se verían 60 posiciones distintas repetidas y
   * el movimiento tendría un micro-tranco.
   */
  alpha(): number
  stop(): void
}

/**
 * Techo de tiempo que se recupera de una sola vez. Si la pestaña estuvo quieta
 * 10 segundos, correr 600 ticks de golpe congelaría el navegador y además haría
 * avanzar la partida a ciegas. Se descarta el tiempo perdido: mejor perder unos
 * frames que trabarse.
 */
const MAX_CATCH_UP_MS = 250

export function startFixedClock(onTick: () => void, ticksPerSecond = 60): FixedClock {
  const stepMs = 1000 / ticksPerSecond
  let accumulator = 0
  let last = performance.now()
  let frame = requestAnimationFrame(loop)

  function loop(now: number): void {
    frame = requestAnimationFrame(loop)

    accumulator += Math.min(now - last, MAX_CATCH_UP_MS)
    last = now

    while (accumulator >= stepMs) {
      accumulator -= stepMs
      onTick()
    }
  }

  return {
    alpha: () => accumulator / stepMs,
    stop: () => cancelAnimationFrame(frame),
  }
}
