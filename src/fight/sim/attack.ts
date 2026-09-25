/**
 * El contrato del frame data. El motor define la forma; los ataques concretos
 * son datos en `data/characters/`.
 *
 * Todo está en FRAMES, nunca en segundos: el tick es la unidad de tiempo del
 * juego. Un ataque de 4 frames de startup dura 4 frames en cualquier máquina, y
 * esa es toda la razón por la que existe el tick fijo.
 */

import type { Fx } from './fixed'

/**
 * Los golpes, como en Brawlhalla: botón × dirección × piso/aire. Los nombres son
 * los de la comunidad de Brawlhalla (n/s/d = neutro, costado, abajo; "sig" es el
 * fuerte de piso) para que se pueda buscar cómo lo resuelve ese juego.
 *
 * Arriba cuenta como neutro: con tres direcciones `W` puede seguir siendo salto y
 * no hay que separar apuntar de saltar en ningún control. Cuál sale con cada input
 * lo decide `moves.ts`, no el tick.
 */
export type MoveKey =
  | 'nLight' | 'sLight' | 'dLight'
  | 'nSig' | 'sSig' | 'dSig'
  | 'nAir' | 'sAir' | 'dAir'
  | 'recovery' | 'groundPound'

/** Todos, en un orden escrito: el que recorren el schema, los tests y la vista. */
export const MOVE_KEYS: readonly MoveKey[] = [
  'nLight', 'sLight', 'dLight',
  'nSig', 'sSig', 'dSig',
  'nAir', 'sAir', 'dAir',
  'recovery', 'groundPound',
]

/**
 * Códigos explícitos para el hash. El 0 es "no está atacando". Un código no se
 * reusa ni se renumera: si un golpe desaparece, su número queda vacío.
 */
export const MOVE_CODES: Record<MoveKey, number> = {
  nLight: 1,
  sLight: 2,
  dLight: 3,
  nSig: 4,
  sSig: 5,
  dSig: 6,
  nAir: 7,
  sAir: 8,
  dAir: 9,
  recovery: 10,
  groundPound: 11,
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
  /**
   * Un impulso propio del golpe: en el frame `frame` del ataque, la velocidad
   * vertical del que pega PASA A SER `vy` (y la horizontal `vx`, espejada con
   * `facing`, si viene). Se reemplaza y no se suma a propósito: es lo que hace
   * que el recovery sirva cayendo. Sumarle -13 a alguien que baja a 16 px/frame
   * lo deja bajando igual; reemplazar corta la caída en seco, igual que el salto
   * de aire. Es un dato del reloj del ataque, como la caja: no se instancia nada.
   */
  readonly motion?: { readonly frame: number; readonly vx?: Fx; readonly vy: Fx }
  /**
   * Sólo una vez por vuelo: se recarga al tocar el piso y al recibir un golpe
   * (como en Brawlhalla: si te pegan, te devuelven la herramienta para volver).
   * Colgarse de la pared no lo recarga. Sin esto, repetir un golpe que impulsa
   * sería volar para siempre.
   */
  readonly oncePerAirtime?: boolean
  /**
   * Frames sin control si se toca el piso con el golpe todavía andando. Sin el
   * dato vale `landFrames` del personaje. Es el castigo de tirar un aéreo tarde:
   * la caída en picada lo tiene largo porque errarla tiene que costar.
   */
  readonly landingLag?: number
}

/** El bit de `airMovesUsed` que marca un golpe como gastado en este vuelo. */
export function airMoveBit(key: MoveKey): number {
  return 1 << MOVE_CODES[key]
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
