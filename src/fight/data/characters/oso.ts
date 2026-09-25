/**
 * El Oso: el personaje base. Es el que maneja la camioneta en MrDrop Run, así
 * que acá está bajado del vehículo y a los golpes.
 *
 * Tiene los once golpes de la tabla de Brawlhalla (`sim/moves.ts`). Los seis de
 * piso y el recovery tienen datos propios; los aéreos rápidos y la caída en
 * picada todavía repiten datos hasta la fase F4 (docs/pelea/tareas.md). Todo lo
 * demás del personaje (velocidades, saltos) está acá abajo en el mismo objeto:
 * un personaje es un archivo de datos.
 */

import { fx, fxRatio } from '../../sim/fixed'
import type { AttackData } from '../../sim/attack'
import type { FighterTuning } from '../../sim/world'
import { defineMoves } from '../schema'

/**
 * Frame data de piso. Se leen de a pares, rápido contra fuerte, y cada dirección
 * tiene un trabajo distinto — que es lo que hace que existan rutas de combo:
 *
 * - Neutro: para arriba. El rápido es un jab corto hacia arriba; el fuerte, el
 *   gancho antiaéreo.
 * - Costado: para adelante. El rápido es el puño de siempre con un paso; el
 *   fuerte, la bocanada que mata de costado.
 * - Abajo: barridas. El rápido levanta al rival en diagonal (el que arranca los
 *   combos); el fuerte llega lejos a ras del piso.
 *
 * El rápido sale en 4-5 frames y se recupera en 10-11; el fuerte tarda 11-13 y te
 * deja vendido 22-24 si errás. Los números de combo (qué entra atrás de qué) no
 * se ajustan acá a ojo: los mide `data/combos.ts` y los fija `combos.test.ts`.
 */

/** Jab corto para arriba: pega al que salta encima tuyo. Empuja poco. */
const N_LIGHT: AttackData = {
  startup: 4,
  active: 3,
  recovery: 10,
  hitbox: { dx: fx(18), dy: fx(-50), width: fx(30), height: fx(34) },
  damage: 6,
  knockback: { x: fxRatio(12, 10), y: fxRatio(-34, 10) },
  scaling: 6,
  hitstun: 12,
  priority: 1,
}

/**
 * El puño de siempre, con un paso adelante: en el frame 1 sale a 3 px/frame y la
 * fricción del piso lo frena. Es el que alcanza al que se aleja caminando.
 */
const S_LIGHT: AttackData = {
  startup: 4,
  active: 3,
  recovery: 10,
  hitbox: { dx: fx(26), dy: fx(-32), width: fx(38), height: fx(30) },
  damage: 7,
  knockback: { x: fxRatio(26, 10), y: fxRatio(-18, 10) },
  scaling: 7,
  hitstun: 12,
  priority: 1,
  motion: { frame: 1, vx: fx(3), vy: 0 },
}

/**
 * La barrida que arranca los combos: levanta al rival casi derecho para arriba,
 * cerca y con el hitstun justo para saltar y agarrarlo con un aéreo. Escala poco
 * con el daño a propósito: con mucho daño igual sale demasiado lejos y el combo
 * se corta solo (lo verifica `combos.test.ts`).
 */
const D_LIGHT: AttackData = {
  startup: 5,
  active: 3,
  recovery: 11,
  hitbox: { dx: fx(24), dy: fx(-10), width: fx(40), height: fx(20) },
  damage: 6,
  // Salieron de una búsqueda con `followsUp` (docs/pelea/memoria.md, F3): -14
  // para arriba lo deja fuera del alcance de los golpes de piso cuando uno se
  // recupera (sólo un aéreo lo agarra), y el escalado de 10 hace que a 80 de daño
  // ya salga más rápido de lo que se puede perseguir. Con 6 seguía siendo combo
  // a 100; con -12 se encadenaba también un golpe de piso.
  knockback: { x: fxRatio(20, 10), y: fxRatio(-140, 10) },
  scaling: 10,
  hitstun: 18,
  priority: 1,
}

/**
 * El gancho antiaéreo: tarda en salir, pega arriba y manda para arriba. Hoy no
 * mata por arriba porque `maxFall` recorta la velocidad vertical del empuje
 * (se decide en F4, docs/pelea/tareas.md).
 */
const N_SIG: AttackData = {
  startup: 11,
  active: 5,
  recovery: 22,
  hitbox: { dx: fx(16), dy: fx(-62), width: fx(44), height: fx(50) },
  damage: 14,
  knockback: { x: fxRatio(15, 10), y: fxRatio(-85, 10) },
  scaling: 12,
  hitstun: 20,
  priority: 2,
}

/**
 * El que mata de costado: la pitada y el bocanazo. Tarda una eternidad en salir
 * (12 frames se ven venir de sobra), con un paso largo en el frame 10, y errarlo
 * te deja quieto 22 frames, más que suficiente para comerse uno de vuelta.
 */
const S_SIG: AttackData = {
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
  motion: { frame: 10, vx: fx(4), vy: 0 },
}

/**
 * Barrida larga a ras del piso: la que más lejos llega, para castigar un
 * aterrizaje. Manda bajo y para afuera.
 */
const D_SIG: AttackData = {
  startup: 13,
  active: 5,
  // 21 y no más: el golpe entero tiene que durar menos de 40 frames (combat.test.ts).
  recovery: 21,
  // Hasta 60 px adelante: el frame del dibujo termina a 62 del origen y la caja no
  // puede llegar más lejos que el humo que la muestra.
  hitbox: { dx: fx(35), dy: fx(-9), width: fx(50), height: fx(18) },
  damage: 13,
  knockback: { x: fxRatio(46, 10), y: fxRatio(-30, 10) },
  scaling: 12,
  hitstun: 18,
  priority: 2,
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
 * El fuerte aéreo apuntando abajo, hasta que la caída en picada tenga datos
 * propios en F4: por ahora es la bocanada de costado.
 */
const HEAVY = S_SIG

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

const MOVES = defineMoves({
  nLight: N_LIGHT,
  sLight: S_LIGHT,
  dLight: D_LIGHT,
  nSig: N_SIG,
  sSig: S_SIG,
  dSig: D_SIG,
  // Los aéreos rápidos y la caída en picada tienen datos propios en F4.
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
