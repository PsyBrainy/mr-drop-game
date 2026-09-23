/**
 * El estado de un match: datos planos, serializables, sin métodos.
 *
 * Todo lo que decide la partida vive acá y nada más que acá. Si un dato influye
 * en el resultado y no está en este objeto, los dos peers pueden tener valores
 * distintos y nadie se va a enterar hasta que uno vea morir a alguien que del
 * otro lado sigue vivo. Eso incluye `prevInput` (para saber qué se apretó recién)
 * y `jumpBuffer` (para el salto pedido antes de aterrizar): parecen detalles de
 * la vista, y son estado de la sim.
 */

import type { MoveKey } from './attack'
import { FX_ZERO, type Fx } from './fixed'
import { NONE, type Input } from './input'
import { rngFromSeed, type RngState } from './rng'
import type { MatchRules, World } from './world'

export type PlayerIndex = 0 | 1

/**
 * El orden de iteración de los jugadores, escrito. Nunca `Object.keys` ni un
 * `Map`: el orden explícito es lo que hace que dos peers resuelvan los golpes
 * igual cuando los dos pegan en el mismo frame.
 */
export const PLAYERS: readonly PlayerIndex[] = [0, 1]

export type FighterStateName =
  | 'idle'
  | 'walk'
  | 'air'
  | 'land'
  | 'attack'
  | 'dodge'
  | 'cling'
  | 'hitstun'
  | 'dead'

/** Códigos explícitos para el hash: el nombre es para leer, el número es para comparar. */
export const STATE_CODES: Record<FighterStateName, number> = {
  idle: 0,
  walk: 1,
  air: 2,
  land: 3,
  attack: 4,
  dodge: 5,
  cling: 6,
  hitstun: 7,
  dead: 8,
}

export interface Fighter {
  /** El origen está en los pies, en el centro del cuerpo. */
  readonly x: Fx
  readonly y: Fx
  readonly vx: Fx
  readonly vy: Fx
  readonly facing: 1 | -1
  readonly state: FighterStateName
  /** Frames que lleva en el estado actual. Los ataques de M2 lo van a usar como reloj. */
  readonly stateFrames: number
  readonly grounded: boolean
  readonly airJumpsLeft: number
  readonly jumpBuffer: number
  /** Qué ataque está haciendo. `stateFrames` es su reloj. */
  readonly attack: MoveKey | null
  /**
   * Sube uno por cada golpe tirado. El rival anota el `hitId` que lo tocó en
   * `lastHitBy`, y así un mismo golpe no puede pegar dos veces aunque la caja
   * esté activa varios frames.
   */
  readonly hitId: number
  readonly lastHitBy: number
  /** Frames sin control por haber aterrizado en medio de un aéreo. */
  readonly landLag: number
  /** Frames que le quedan para colgarse de una pared. Se recargan al aterrizar. */
  readonly clingLeft: number
  /**
   * Daño acumulado. No es vida que baja: es el multiplicador del empuje. La
   * barra de resistencia que ve el jugador es este número al revés
   * (`resistanceOf`), no otro dato.
   */
  readonly damage: number
  readonly stocks: number
  readonly hitstun: number
  readonly invuln: number
  readonly prevInput: Input
}

export interface MatchState {
  readonly tick: number
  readonly rng: RngState
  readonly fighters: readonly [Fighter, Fighter]
  readonly over: boolean
  /** `null` con `over` en true es empate: los dos salieron en el mismo frame. */
  readonly winner: PlayerIndex | null
}

/**
 * El estado es readonly de cara afuera y `step()` no lo muta: clona y trabaja
 * sobre el borrador. Es lo que permite guardar el estado de hace 8 frames para
 * el rollback de M5 sin copiarlo defensivamente en cada lado.
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] }
export type FighterDraft = Mutable<Fighter>

export interface MatchDraft {
  tick: number
  rng: RngState
  fighters: [FighterDraft, FighterDraft]
  over: boolean
  winner: PlayerIndex | null
}

function spawnFighter(world: World, index: PlayerIndex): Fighter {
  const spawn = world.stage.spawns[index]
  const tuning = world.tuning[index]

  return {
    x: spawn.x,
    y: spawn.y,
    vx: FX_ZERO,
    vy: FX_ZERO,
    // Arrancan mirándose: el 0 está a la izquierda del 1.
    facing: index === 0 ? 1 : -1,
    state: 'idle',
    stateFrames: 0,
    grounded: true,
    airJumpsLeft: tuning.airJumps,
    jumpBuffer: 0,
    attack: null,
    hitId: 0,
    // -1 y no 0: el 0 es un `hitId` válido y marcaría el primer golpe como ya recibido.
    lastHitBy: -1,
    landLag: 0,
    clingLeft: tuning.wall.clingFrames,
    damage: 0,
    stocks: world.rules.stocks,
    hitstun: 0,
    invuln: 0,
    prevInput: NONE,
  }
}

export function initialState(world: World, seed: number): MatchState {
  return {
    tick: 0,
    rng: rngFromSeed(seed),
    fighters: [spawnFighter(world, 0), spawnFighter(world, 1)],
    over: false,
    winner: null,
  }
}

/** Vuelve a poner a un jugador en juego después de un ring-out, gastando una vida. */
export function respawn(draft: FighterDraft, world: World, index: PlayerIndex): void {
  const spawn = world.stage.spawns[index]
  const tuning = world.tuning[index]

  draft.x = spawn.x
  draft.y = spawn.y
  draft.vx = FX_ZERO
  draft.vy = FX_ZERO
  draft.state = 'idle'
  draft.stateFrames = 0
  draft.grounded = true
  draft.airJumpsLeft = tuning.airJumps
  draft.jumpBuffer = 0
  draft.attack = null
  draft.landLag = 0
  draft.clingLeft = tuning.wall.clingFrames
  // El daño se reinicia con la vida: si no, la segunda vida duraría dos golpes.
  draft.damage = 0
  draft.hitstun = 0
  draft.invuln = world.rules.respawnInvuln
}

export function cloneState(state: MatchState): MatchDraft {
  return {
    tick: state.tick,
    rng: state.rng,
    fighters: [{ ...state.fighters[0] }, { ...state.fighters[1] }],
    over: state.over,
    winner: state.winner,
  }
}

/**
 * La resistencia que se muestra: el daño leído al revés. Se corta en 0 y el daño
 * sigue subiendo por debajo, así que con la barra vacía cada golpe nuevo te
 * manda más lejos que el anterior. Es una lectura, no estado: no entra al hash.
 */
export function resistanceOf(fighter: Fighter, rules: MatchRules): number {
  return Math.max(0, rules.maxResistance - fighter.damage)
}
