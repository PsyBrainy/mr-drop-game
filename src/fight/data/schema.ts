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
  // El impulso arranca después del frame 0: en el 0 el golpe recién se está
  // eligiendo, y aplicarlo ahí saltearía el orden del tick.
  motion: z.object({ frame: positive, vx: whole.optional(), vy: whole.optional() }).optional(),
  oncePerAirtime: z.boolean().optional(),
  landingLag: positive.optional(),
}).refine((move) => !move.motion || move.motion.frame < move.startup + move.active + move.recovery, {
  message: 'el impulso tiene que caer adentro del golpe',
})

/**
 * Los once, todos obligatorios. Un personaje a medio hacer no carga: si le
 * faltara el `dAir`, apretar abajo + rápido en el aire no haría nada y nadie
 * sabría por qué. Dos golpes pueden ser el mismo dato, pero se escriben los dos.
 */
const moveSetSchema = z.object({
  nLight: attackSchema,
  sLight: attackSchema,
  dLight: attackSchema,
  nSig: attackSchema,
  sSig: attackSchema,
  dSig: attackSchema,
  nAir: attackSchema,
  sAir: attackSchema,
  dAir: attackSchema,
  recovery: attackSchema,
  groundPound: attackSchema,
})

/**
 * Valida y devuelve el set. Se llama al definir cada personaje, así que un error
 * revienta al importar el módulo: antes de que nadie pueda entrar a una partida.
 */
export function defineMoves(moves: MoveSet): MoveSet {
  return moveSetSchema.parse(moves)
}
