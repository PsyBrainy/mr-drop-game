/**
 * De un input a un golpe. Es la tabla de Brawlhalla: botón × dirección ×
 * piso/aire, escrita como una función pura del byte de input y de si el
 * personaje está parado. No mira nada más del estado, así que no hay forma de
 * que dos peers elijan golpes distintos con el mismo input.
 */

import type { MoveKey } from './attack'
import { axis, DOWN, held, type Input } from './input'

/**
 * Hacia dónde se apunta un golpe. Arriba no existe como dirección propia: cuenta
 * como neutro, igual que en Brawlhalla. Así `W` / ↑ sigue siendo salto sin que
 * apuntar para arriba haga saltar a nadie.
 */
export type Aim = 'neutral' | 'side' | 'down'

export type AttackButton = 'light' | 'heavy'

/**
 * Abajo le gana al costado. Con stick, abajo-adelante en diagonal es lo más
 * fácil de apretar sin querer y el golpe bajo es el que más se busca, así que la
 * diagonal da el bajo. Izquierda y derecha a la vez son neutro (`axis`), que es
 * lo que menos sorprende cuando alguien apoya la mano en el teclado.
 */
export function aimOf(input: Input): Aim {
  if (held(input, DOWN)) return 'down'
  return axis(input) === 0 ? 'neutral' : 'side'
}

const GROUND: Record<AttackButton, Record<Aim, MoveKey>> = {
  light: { neutral: 'nLight', side: 'sLight', down: 'dLight' },
  heavy: { neutral: 'nSig', side: 'sSig', down: 'dSig' },
}

/**
 * En el aire, el fuerte neutro y el de costado son el mismo: el recovery, el
 * golpe que te impulsa para volver. Apuntar abajo es caer en picada.
 */
const AIR: Record<AttackButton, Record<Aim, MoveKey>> = {
  light: { neutral: 'nAir', side: 'sAir', down: 'dAir' },
  heavy: { neutral: 'recovery', side: 'recovery', down: 'groundPound' },
}

export function moveFor(grounded: boolean, button: AttackButton, aim: Aim): MoveKey {
  return (grounded ? GROUND : AIR)[button][aim]
}

const AERIAL: ReadonlySet<MoveKey> = new Set(Object.values(AIR).flatMap((row) => Object.values(row)))

/** ¿Es de la tabla del aire? Un golpe de piso tirado en el aire (gravity cancel) no lo es. */
export function isAerialMove(key: MoveKey): boolean {
  return AERIAL.has(key)
}
