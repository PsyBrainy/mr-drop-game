/**
 * El Oso: el personaje base. Es el que maneja la camioneta en MrDrop Run, así
 * que acá está bajado del vehículo y a los golpes.
 *
 * Tiene los once golpes de la tabla de Brawlhalla (`sim/moves.ts`), cada uno con
 * sus datos (M6, docs/pelea/tareas.md). Todo lo demás del personaje
 * (velocidades, saltos) está acá abajo en el mismo objeto: un personaje es un
 * archivo de datos.
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
  // Sólo horizontal: tirado en el aire (gravity cancel) no frena la caída.
  motion: { frame: 1, vx: fx(3) },
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
  // Salieron de dos búsquedas con `followsUp` (docs/pelea/memoria.md, F3 y F4):
  // -14 para arriba lo deja fuera del alcance de los golpes de piso cuando uno
  // se recupera (sólo un aéreo lo agarra). El escalado era 10 en F3; en F4 el
  // empuje dejó de recortarse a 16 px/frame en hitstun y con 10 el rival salía
  // tan alto que a 40 ya no se lo alcanzaba: con 6 el combo entra hasta 40 y se
  // corta a 60.
  knockback: { x: fxRatio(20, 10), y: fxRatio(-140, 10) },
  scaling: 6,
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
  motion: { frame: 10, vx: fx(4) },
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
 * Los aéreos rápidos. Cada uno con su trabajo, igual que en el piso:
 *
 * - Neutro: una patada en círculo alrededor del cuerpo, para malabarear arriba.
 * - Costado: la patada voladora de siempre, el aéreo de persecución. Es el que
 *   cierra el combo de la barrida.
 * - Abajo: el pisotón, el SPIKE: manda para abajo. Contra el que está afuera
 *   colgado del borde, es el que lo manda al fondo.
 */
const N_AIR: AttackData = {
  startup: 5,
  active: 5,
  recovery: 12,
  // Centrada casi en el cuerpo: pega adelante y un poco atrás.
  hitbox: { dx: fx(6), dy: fx(-40), width: fx(56), height: fx(44) },
  damage: 7,
  knockback: { x: fxRatio(16, 10), y: fxRatio(-50, 10) },
  scaling: 8,
  hitstun: 15,
  priority: 1,
}

const S_AIR: AttackData = {
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
 * El spike: `knockback.y` positivo es para abajo. A poco daño te baja un poco y
 * con los saltos volvés; con daño, te hunde más rápido de lo que podés subir.
 * Es el golpe para el que está afuera colgando del borde.
 * La caja está debajo de los pies. Contra alguien parado en el piso no rebota:
 * aterriza en el acto y se queda en hitstun ahí (el piso se detecta por cruce,
 * así que no hay forma de atravesarlo).
 */
const D_AIR: AttackData = {
  startup: 6,
  active: 4,
  recovery: 14,
  hitbox: { dx: fx(10), dy: fx(-6), width: fx(34), height: fx(28) },
  damage: 9,
  // Salió de una búsqueda (docs/pelea/memoria.md, F4) contra un rival afuera
  // del escenario que vuelve jugando bien, con saltos, pared y recovery: con
  // estos números sobrevive hasta 60 de daño y muere desde 80-100. Empuja poco
  // y aturde poco al principio; lo que lo vuelve mortal es el escalado (26, el
  // más alto del personaje). Con 7 de empuje y 14 de hitstun mataba a 0.
  knockback: { x: fxRatio(10, 10), y: fxRatio(40, 10) },
  scaling: 26,
  hitstun: 10,
  priority: 1,
}

/**
 * La caída en picada (fuerte + abajo en el aire): en el frame 4 baja a 14
 * px/frame y pega abajo mientras cae. Levanta al que agarra. Errarla sale caro:
 * si tocás el piso con el golpe andando quedás 18 frames sin control.
 */
const GROUND_POUND: AttackData = {
  startup: 8,
  active: 12,
  recovery: 14,
  hitbox: { dx: fx(6), dy: fx(-10), width: fx(44), height: fx(30) },
  damage: 13,
  knockback: { x: fxRatio(35, 10), y: fxRatio(-50, 10) },
  scaling: 11,
  hitstun: 18,
  priority: 2,
  motion: { frame: 4, vx: 0, vy: fx(14) },
  landingLag: 18,
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

const MOVES = defineMoves({
  nLight: N_LIGHT,
  sLight: S_LIGHT,
  dLight: D_LIGHT,
  nSig: N_SIG,
  sSig: S_SIG,
  dSig: D_SIG,
  nAir: N_AIR,
  sAir: S_AIR,
  dAir: D_AIR,
  recovery: RECOVERY,
  groundPound: GROUND_POUND,
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
  /**
   * El techo del empuje en hitstun. 24: un golpe fuerte con mucho daño manda
   * más rápido que la caída normal (16), y el spike hunde más rápido de lo que se
   * cae solo. Por arriba no alcanza para matar (la zona de muerte está a ~820
   * px sobre el piso y haría falta ~37): ver docs/pelea/memoria.md, F4.
   */
  knockbackMaxSpeed: fx(24),
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
    // El primer frame después de la invulnerabilidad: el gravity cancel más
    // rápido posible sin pegar invulnerable. 16 frames son ~0,27 s.
    attackCancelFrom: 16,
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
