/**
 * El input de un frame es un byte. No es microoptimización: es lo que hace
 * viable el netcode. Cada paquete lleva los últimos 8 frames de input
 * redundantes (WebSocket es TCP: un paquete demorado no puede congelar la
 * partida), y eso son 8 bytes por jugador. Un objeto `{ left: true, ... }`
 * serializado no cabría en ese presupuesto, y además no se podría comparar por
 * igualdad ni guardar un replay entero en una fila de Postgres.
 */

export type Input = number

export const NONE = 0
export const LEFT = 1 << 0
export const RIGHT = 1 << 1
export const UP = 1 << 2
export const DOWN = 1 << 3
export const JUMP = 1 << 4
export const LIGHT = 1 << 5
export const HEAVY = 1 << 6
export const DODGE = 1 << 7

export function held(input: Input, button: number): boolean {
  return (input & button) !== 0
}

/** Apretado en este frame y no en el anterior. La mayoría de las acciones usan esto. */
export function pressed(previous: Input, current: Input, button: number): boolean {
  return held(current, button) && !held(previous, button)
}

/**
 * Izquierda/derecha como -1, 0 o 1. Las dos a la vez dan neutro: es lo que menos
 * sorprende cuando alguien apoya la mano en el teclado, y no depende de en qué
 * orden se apretaron (que no viaja en el bitmask y sería una fuente de desync).
 */
export function axis(input: Input): -1 | 0 | 1 {
  const left = held(input, LEFT)
  const right = held(input, RIGHT)
  if (left === right) return 0
  return right ? 1 : -1
}
