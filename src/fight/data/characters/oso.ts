/**
 * El Oso: el personaje base. Es el que maneja la camioneta en MrDrop Run, así
 * que acá está bajado del vehículo y a los golpes.
 *
 * Tiene los once golpes de la tabla de Brawlhalla (`sim/moves.ts`), pero por
 * ahora son tres golpes distintos repetidos: un rápido de piso para meter daño,
 * uno aéreo para castigar al que salta, y uno fuerte lento que es el que mata.
 * Es la fase F0 de M6: la estructura primero, sin cambiar cómo se juega; cada
 * golpe recibe sus propios datos en las fases siguientes (docs/pelea/tareas.md).
 * Todo lo demás del personaje (velocidades, saltos) está acá abajo en el mismo
 * objeto: un personaje es un archivo de datos.
 */

import { fx, fxRatio } from '../../sim/fixed'
import type { AttackData } from '../../sim/attack'
import type { FighterTuning } from '../../sim/world'
import { defineMoves } from '../schema'

/**
 * Frame data. Los tres se leen comparando startup contra recovery: el rápido
 * sale en 4 frames y se recupera en 10; el fuerte tarda 12 en salir y te deja
 * vendido 22 si errás. Esa es toda la decisión que tiene que tomar el jugador.
 */
const LIGHT_GROUND: AttackData = {
  startup: 4,
  active: 3,
  recovery: 10,
  hitbox: { dx: fx(26), dy: fx(-32), width: fx(38), height: fx(30) },
  damage: 7,
  knockback: { x: fxRatio(26, 10), y: fxRatio(-18, 10) },
  scaling: 7,
  hitstun: 12,
  priority: 1,
}

/**
 * El aéreo llega un poco más lejos y empuja más: es el que se usa para sacar
 * al rival del escenario cuando ya está afuera peleando por volver.
 */
const LIGHT_AIR: AttackData = {
  startup: 5,
  active: 4,
  recovery: 12,
  hitbox: { dx: fx(24), dy: fx(-34), width: fx(42), height: fx(38) },
  damage: 8,
  knockback: { x: fxRatio(30, 10), y: fxRatio(-26, 10) },
  scaling: 8,
  hitstun: 14,
  priority: 1,
}

/**
 * El que mata. Tarda una eternidad en salir (12 frames se ven venir de sobra)
 * y el castigo por errarlo es quedar quieto 22 frames, que a 60 por segundo es
 * más que suficiente para comerse uno de vuelta.
 */
const HEAVY: AttackData = {
  startup: 12,
  active: 4,
  recovery: 22,
  hitbox: { dx: fx(34), dy: fx(-34), width: fx(52), height: fx(44) },
  damage: 15,
  knockback: { x: fxRatio(52, 10), y: fxRatio(-62, 10) },
  scaling: 13,
  hitstun: 20,
  // Más alta que los livianos: el fuerte atraviesa un golpe rápido, que es lo
  // que evita que apretar el botón rápido a ciegas sea siempre la respuesta.
  priority: 2,
}

/**
 * El recovery: el fuerte en el aire, que te impulsa para arriba pegando. Es la
 * herramienta para volver al escenario, así que lo que importa es el impulso:
 * en el frame 3 la velocidad vertical pasa a ser -13 (el salto de piso es -13,5
 * y el de aire -12), aunque vengas cayendo a toda velocidad. Una vez por vuelo.
 *
 * La caja está arriba de la cabeza, donde está el puño: pega al que te espera
 * en el borde parado encima tuyo. Empuja para arriba y poco para adelante.
 * El recovery largo (16) es el precio: si lo errás cerca de alguien, cae solo y
 * vendido.
 */
const RECOVERY: AttackData = {
  startup: 3,
  active: 6,
  recovery: 16,
  hitbox: { dx: fx(10), dy: fx(-60), width: fx(36), height: fx(44) },
  damage: 9,
  knockback: { x: fxRatio(10, 10), y: fxRatio(-75, 10) },
  scaling: 9,
  hitstun: 16,
  priority: 2,
  motion: { frame: 3, vy: fx(-13) },
  oncePerAirtime: true,
}

/**
 * F0: cada casillero de la tabla apunta a uno de los tres golpes de siempre, así
 * el juego se siente igual que antes. El `recovery` todavía no impulsa: eso es F2.
 */
const MOVES = defineMoves({
  nLight: LIGHT_GROUND,
  sLight: LIGHT_GROUND,
  dLight: LIGHT_GROUND,
  nSig: HEAVY,
  sSig: HEAVY,
  dSig: HEAVY,
  nAir: LIGHT_AIR,
  sAir: LIGHT_AIR,
  dAir: LIGHT_AIR,
  recovery: RECOVERY,
  groundPound: HEAVY,
})

export const OSO: FighterTuning = {
  halfWidth: fx(16),
  height: fx(56),

  walkSpeed: fxRatio(50, 10),
  groundAccel: fxRatio(7, 10),
  groundFriction: fxRatio(9, 10),

  /**
   * La deriva. Hasta M6 estaba inflada (5,6) porque sin movimiento de
   * recuperación los saltos y el esquive eran lo único para volver. Con el
   * recovery baja a 4,8: el test de recuperación marca que desde lejos y abajo
   * del borde se vuelve CON el recovery y no sin él, que es lo que hace que
   * gastarlo sea una decisión. Más abajo de 4,4 empieza a no alcanzar ni con él.
   * Ojo que también es el piso del freno del knockback (`decayKnockback`).
   */
  airSpeed: fxRatio(48, 10),
  airDrift: fxRatio(35, 100),

  gravity: fxRatio(9, 10),
  maxFall: fx(16),
  jumpVelocity: fx(-13.5),
  airJumpVelocity: fx(-12),
  airJumps: 2,

  knockbackDecay: fxRatio(8, 100),

  dodge: {
    frames: 26,
    // Arranca a los 3 frames: apretar en el frame del impacto no alcanza, hay
    // que adelantarse. Y termina bastante antes que el esquive, así que errarle
    // al momento te deja quieto y vendido.
    invulnFrom: 3,
    invulnTo: 15,
    speed: fx(8),
  },

  /**
   * Colgarse del borde. 45 frames de presupuesto por vuelo (tres cuartos de
   * segundo) que sólo se recargan tocando el piso: alcanza para acomodarse y
   * saltar, no para vivir ahí colgado. El salto de pared no gasta saltos de
   * aire — es justamente el recurso que te devuelve la pelea cuando ya no te
   * quedaba nada.
   */
  wall: {
    clingFrames: 45,
    slide: fxRatio(12, 10),
    /**
     * El salto de pared sale casi para arriba: poco hacia afuera y fuerte hacia
     * arriba. Con 6 y -11 te despegaba de la pared más de lo que te subía, y
     * desde la mitad del canto para abajo ya no había forma de volver aunque se
     * jugara perfecto (el test "desde abajo del borde" lo mide). Lo que decide si
     * un golpe mata sigue siendo lo lejos que te manda, no la pared.
     */
    jumpX: fx(3),
    jumpY: fx(-13),
  },

  moves: MOVES,

  jumpBufferFrames: 4,
  /**
   * 6 frames (100 ms): alcanza para apretar el segundo golpe mientras se ve
   * terminar el primero, sin tener que adivinar el frame. Con más de ~10 se
   * empieza a sentir que el personaje hace cosas que uno ya no quería.
   */
  attackBufferFrames: 6,
  landFrames: 3,
}
