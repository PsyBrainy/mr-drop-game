/**
 * Checksum del estado. Es la herramienta de diagnóstico más importante del
 * proyecto.
 *
 * Cada 30 frames los dos peers se intercambian este número. Si difiere, hay
 * desync y el match se aborta ahí mismo. La alternativa —seguir jugando— produce
 * partidas donde cada jugador vio algo distinto y bugs que no se pueden
 * reproducir nunca. Con el hash, en cambio, el frame exacto en el que las dos
 * simulaciones se separaron queda registrado.
 *
 * FNV-1a con `Math.imul`, que es multiplicación de 32 bits exacta en cualquier
 * motor. Los campos se mezclan en un orden escrito a mano: nada de
 * `JSON.stringify` ni de recorrer las claves del objeto, porque el día que
 * alguien agregue un campo el hash cambiaría en silencio.
 */

import { MOVE_CODES } from './attack'
import type { Fighter, MatchState } from './state'
import { STATE_CODES } from './state'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

function mix(hash: number, value: number): number {
  return Math.imul(hash ^ (value | 0), FNV_PRIME) >>> 0
}

function mixFighter(hash: number, fighter: Fighter): number {
  let h = hash
  h = mix(h, fighter.x)
  h = mix(h, fighter.y)
  h = mix(h, fighter.vx)
  h = mix(h, fighter.vy)
  h = mix(h, fighter.facing)
  h = mix(h, STATE_CODES[fighter.state])
  h = mix(h, fighter.stateFrames)
  h = mix(h, fighter.grounded ? 1 : 0)
  h = mix(h, fighter.airJumpsLeft)
  h = mix(h, fighter.jumpBuffer)
  h = mix(h, fighter.attack === null ? 0 : MOVE_CODES[fighter.attack])
  h = mix(h, fighter.hitId)
  h = mix(h, fighter.lastHitBy)
  h = mix(h, fighter.landLag)
  h = mix(h, fighter.clingLeft)
  h = mix(h, fighter.damage)
  h = mix(h, fighter.stocks)
  h = mix(h, fighter.hitstun)
  h = mix(h, fighter.invuln)
  h = mix(h, fighter.prevInput)
  return h
}

export function hashState(state: MatchState): number {
  let h = FNV_OFFSET
  h = mix(h, state.tick)
  h = mix(h, state.rng)
  h = mix(h, state.over ? 1 : 0)
  // El empate (`null`) y "ganó el 0" son resultados distintos: -1 los separa.
  h = mix(h, state.winner === null ? -1 : state.winner)
  h = mixFighter(h, state.fighters[0])
  h = mixFighter(h, state.fighters[1])
  return h
}

/** Para logs y mensajes de desync: 8 dígitos hex leen mucho mejor que 3.100.000.000. */
export function formatHash(hash: number): string {
  return hash.toString(16).padStart(8, '0')
}
