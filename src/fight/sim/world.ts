/**
 * Lo que la sim necesita saber del escenario y de los personajes, y nada más.
 *
 * Las interfaces viven acá y las instancias en `data/`: el motor define la forma
 * y los datos la rellenan. Es lo que permite que un personaje sea un archivo de
 * datos en vez de una rama en el tick — y lo que evita que la sim termine con
 * números de un personaje escritos adentro, que es la forma más rápida de tener
 * un motor que sirve para un solo juego.
 *
 * El `World` no es estado: no cambia durante el match y no entra al hash. Viaja
 * aparte del `MatchState` por eso mismo.
 */

import type { MoveSet } from './attack'
import type { Fx } from './fixed'

export interface Platform {
  readonly left: Fx
  readonly right: Fx
  readonly top: Fx
  /**
   * Hasta dónde baja el costado. La plataforma flota: abajo se puede pasar, y
   * los costados son paredes a las que agarrarse. Cuanto más profunda, más
   * perdonavidas es el escenario.
   */
  readonly bottom: Fx
}

/**
 * Una plataforma flotante "blanda", como las de Brawlhalla: se atraviesa desde
 * abajo y de costado, se aterriza desde arriba, y apretando abajo se la
 * atraviesa hacia abajo. No tiene paredes: no se cuelga nadie de ella.
 *
 * Se mueve de ida y vuelta en línea recta: parte de su posición y llega a
 * `travel` en medio `period`, y vuelve en el otro medio. El recorrido es una
 * función del tick y nada más (ver `platforms.ts`): no guarda estado, así que no
 * hay nada que se pueda desincronizar entre los dos peers.
 */
export interface SoftPlatform {
  /** Borde izquierdo y altura del piso en el tick 0 (el punto de partida). */
  readonly left: Fx
  readonly top: Fx
  readonly width: Fx
  /** Cuánto se corre en la ida. (0, 0) es una plataforma quieta. */
  readonly travelX: Fx
  readonly travelY: Fx
  /** Ticks de una ida y vuelta completa. Par, para que la mitad sea exacta. */
  readonly period: number
  /** Desfase en ticks: dos plataformas que no van al mismo compás. */
  readonly phase: number
}

export interface Stage {
  readonly name: string
  /** La plataforma principal. */
  readonly ground: Platform
  /** Las flotantes, arriba. Se revisan en este orden: el orden es parte del determinismo. */
  readonly platforms: readonly SoftPlatform[]
  /** Fuera de esto, ring-out. */
  readonly blastLeft: Fx
  readonly blastRight: Fx
  readonly blastTop: Fx
  readonly blastBottom: Fx
  /** Dónde arranca y reaparece cada jugador. Uno por índice, en orden. */
  readonly spawns: readonly [{ x: Fx; y: Fx }, { x: Fx; y: Fx }]
}

export interface FighterTuning {
  /** Medio ancho y alto de la caja del cuerpo. El origen del personaje está en sus pies. */
  readonly halfWidth: Fx
  readonly height: Fx

  /** Velocidad de caminata y cuánto tarda en alcanzarla. */
  readonly walkSpeed: Fx
  readonly groundAccel: Fx
  /** Frenada al soltar la dirección. Más alta que la aceleración: parar se siente firme. */
  readonly groundFriction: Fx

  /** Control en el aire. `airDrift` es la aceleración; `airSpeed`, el techo. */
  readonly airSpeed: Fx
  readonly airDrift: Fx

  readonly gravity: Fx
  readonly maxFall: Fx
  readonly jumpVelocity: Fx
  /** Los saltos en el aire suben menos: el primero tiene que valer más que los otros. */
  readonly airJumpVelocity: Fx
  readonly airJumps: number

  /**
   * Frames que se recuerda un salto pedido en el aire justo antes de tocar el
   * piso. Sin esto, apretar salto un frame antes de aterrizar no hace nada y se
   * siente como que el juego se comió el input.
   */
  readonly jumpBufferFrames: number
  /**
   * Cuánto se frena el empuje de un golpe, por frame. Sin esto, cualquier
   * knockback te manda afuera tarde o temprano, porque en el aire no hay nada
   * que te detenga: el KO dejaría de depender de la fuerza del golpe.
   *
   * No afecta al movimiento normal: la deriva empuja bastante más fuerte que
   * esto, así que volar por un golpe se frena y caminar por el aire no.
   */
  readonly knockbackDecay: Fx

  readonly dodge: DodgeTuning

  readonly wall: WallTuning

  /** Los ataques del personaje. Es data pura: el tick no sabe cuáles son. */
  readonly moves: MoveSet

  /**
   * Frames que dura la pose de aterrizaje. Hoy es sólo visual: un aterrizaje
   * limpio no quita el control, porque castigar todo salto haría impagable el
   * recurso que más se usa. El castigo de verdad llega con los ataques de M2,
   * atado a caer en medio de un aéreo (hard landing), no a caer.
   */
  readonly landFrames: number
}

/**
 * Agarrarse del costado de la plataforma. Es la herramienta de recuperación que
 * convierte quedar afuera en algo que se pelea en vez de sufrirse: llegás a la
 * pared, te colgás, y desde ahí saltás de vuelta.
 *
 * El presupuesto de frames se gasta y sólo se recarga tocando el piso, así que
 * no se puede vivir colgado de la pared ni escalarla para siempre.
 */
export interface WallTuning {
  readonly clingFrames: number
  /** Cuánto resbala por frame mientras está colgado. */
  readonly slide: Fx
  readonly jumpX: Fx
  readonly jumpY: Fx
}

/**
 * El esquive: la única defensa que hay. Son frames de invulnerabilidad a cambio
 * de quedar quieto y vendido si errás el momento — sin esto, cada intercambio es
 * un trade y la pelea se decide por quién aprieta más rápido.
 */
export interface DodgeTuning {
  readonly frames: number
  /** Ventana de invulnerabilidad, en frames desde que arranca. */
  readonly invulnFrom: number
  readonly invulnTo: number
  /** Envión del esquive en el aire. En el piso es un esquive en el lugar. */
  readonly speed: Fx
}

/** Cuántas vidas tiene cada uno. Es regla de match, no de personaje. */
export interface MatchRules {
  readonly stocks: number
  /** Frames de invulnerabilidad al reaparecer. */
  readonly respawnInvuln: number
  /**
   * Con cuánta resistencia arranca cada uno. NO es estado ni entra en la física:
   * el daño acumulado es lo único que existe para la sim, y la resistencia es
   * ese mismo número leído al revés para poder mostrarlo como barra. Tener las
   * dos cosas guardadas sería el mismo dato dos veces, y dos datos que dicen lo
   * mismo terminan diciendo cosas distintas.
   */
  readonly maxResistance: number
}

export interface World {
  readonly stage: Stage
  /** Uno por índice de jugador: los dos pueden tener personajes distintos. */
  readonly tuning: readonly [FighterTuning, FighterTuning]
  readonly rules: MatchRules
}

export const DEFAULT_RULES: MatchRules = { stocks: 3, respawnInvuln: 60, maxResistance: 100 }
