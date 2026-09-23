/**
 * Validación del frame data. Es la única dependencia que entra a `data/`, y
 * corre una vez al cargar el personaje — nunca adentro del tick.
 *
 * Existe porque un personaje mal escrito tiene que fallar al arrancar y no en
 * medio de un match: un `startup` en 0 haría que el golpe pegue en el mismo
 * frame en que se aprieta el botón (imposible de ver venir), y un `active` en 0
 * sería un ataque que no puede pegar nunca. Son errores de tipeo que TypeScript
 * no ve, porque todos son `number`.
 */

import { z } from 'zod'
import type { MoveSet } from '../sim/attack'

/** Todo lo de la sim es entero: son píxeles en punto fijo o frames. */
const whole = z.number().int()
const positive = whole.positive()

const boxSchema = z.object({
  dx: whole,
  dy: whole,
  width: positive,
  height: positive,
})

const attackSchema = z.object({
  // Un golpe sin startup no se puede ver venir y uno sin active no pega nunca.
  startup: positive,
  active: positive,
  // Sin recovery, errar un golpe no tendría castigo y no habría nada que jugar.
  recovery: positive,
  hitbox: boxSchema,
  damage: positive,
  knockback: z.object({ x: whole, y: whole }),
  scaling: whole.nonnegative(),
  hitstun: positive,
  priority: whole.nonnegative(),
})

const moveSetSchema = z.object({
  lightGround: attackSchema,
  lightAir: attackSchema,
  heavy: attackSchema,
})

/**
 * Valida y devuelve el set. Se llama al definir cada personaje, así que un error
 * revienta al importar el módulo: antes de que nadie pueda entrar a una partida.
 */
export function defineMoves(moves: MoveSet): MoveSet {
  return moveSetSchema.parse(moves)
}
