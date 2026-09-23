/**
 * El contrato del frame data. El motor define la forma; los ataques concretos
 * son datos en `data/characters/`.
 *
 * Todo está en FRAMES, nunca en segundos: el tick es la unidad de tiempo del
 * juego. Un ataque de 4 frames de startup dura 4 frames en cualquier máquina, y
 * esa es toda la razón por la que existe el tick fijo.
 */

import type { Fx } from './fixed'

export type MoveKey = 'lightGround' | 'lightAir' | 'heavy'

/** Códigos explícitos para el hash del estado. El 0 es "no está atacando". */
export const MOVE_CODES: Record<MoveKey, number> = {
  lightGround: 1,
  lightAir: 2,
  heavy: 3,
}

/**
 * Una caja relativa al personaje. `dx` es el desplazamiento del CENTRO desde el
 * origen (los pies), y se espeja con `facing`: el mismo dato sirve mirando para
 * los dos lados. `dy` va con el eje de la pantalla, así que hacia arriba es
 * negativo.
 */
export interface Box {
  readonly dx: Fx
  readonly dy: Fx
  readonly width: Fx
  readonly height: Fx
}

export interface AttackData {
  /** Frames antes de que la caja exista. Es lo que se puede ver venir. */
  readonly startup: number
  /** Frames en los que la caja pega. */
  readonly active: number
  /** Frames de después, en los que estás vendido. */
  readonly recovery: number
  readonly hitbox: Box
  /** Puntos que suma al daño acumulado del rival. */
  readonly damage: number
  /** Empuje base, en píxeles por frame. Se espeja con el `facing` del atacante. */
  readonly knockback: { readonly x: Fx; readonly y: Fx }
  /**
   * Cuánto crece el empuje por cada punto de daño acumulado, en milésimas. Con
   * 12, un rival con 100 de daño recibe 2,2 veces el empuje base. Es lo que hace
   * que el daño importe sin que nadie tenga barra de vida: no te mata el golpe,
   * te mata lo lejos que te manda.
   */
  readonly scaling: number
  /** Frames que el rival queda sin control. */
  readonly hitstun: number
  /**
   * Quién gana cuando los dos pegan en el mismo frame. Igual prioridad es
   * choque: se anulan los dos.
   */
  readonly priority: number
}

export type MoveSet = Readonly<Record<MoveKey, AttackData>>

export function totalFrames(attack: AttackData): number {
  return attack.startup + attack.active + attack.recovery
}

/** ¿La caja pega en este frame del ataque? El frame 0 es el primero de startup. */
export function isActive(attack: AttackData, frame: number): boolean {
  return frame >= attack.startup && frame < attack.startup + attack.active
}

export function isOver(attack: AttackData, frame: number): boolean {
  return frame >= totalFrames(attack)
}
