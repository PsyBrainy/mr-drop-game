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

import type { Fx } from './fixed'

export interface Platform {
  readonly left: Fx
  readonly right: Fx
  readonly top: Fx
}

export interface Stage {
  readonly name: string
  /** La plataforma principal. Las flotantes llegan cuando haya más de un escenario. */
  readonly ground: Platform
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
   * Frames que dura la pose de aterrizaje. Hoy es sólo visual: un aterrizaje
   * limpio no quita el control, porque castigar todo salto haría impagable el
   * recurso que más se usa. El castigo de verdad llega con los ataques de M2,
   * atado a caer en medio de un aéreo (hard landing), no a caer.
   */
  readonly landFrames: number
}

/** Cuántas vidas tiene cada uno. Es regla de match, no de personaje. */
export interface MatchRules {
  readonly stocks: number
  /** Frames de invulnerabilidad al reaparecer. */
  readonly respawnInvuln: number
}

export interface World {
  readonly stage: Stage
  /** Uno por índice de jugador: los dos pueden tener personajes distintos. */
  readonly tuning: readonly [FighterTuning, FighterTuning]
  readonly rules: MatchRules
}

export const DEFAULT_RULES: MatchRules = { stocks: 3, respawnInvuln: 60 }
