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
import type { Aim, AttackButton } from './moves'
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
  /**
   * Sobre qué plataforma flotante está parado (su índice en `stage.platforms`),
   * o -1 si está en el piso principal o en el aire. Lo necesita la física para
   * llevarlo encima cuando la plataforma se mueve.
   */
  readonly platform: number
  /**
   * Frames en los que atraviesa las plataformas flotantes después de bajarse de
   * una apretando abajo. Sin esto aterrizaría en la misma plataforma en el frame
   * siguiente.
   */
  readonly dropThrough: number
  readonly airJumpsLeft: number
  readonly jumpBuffer: number
  /**
   * Frames que se recuerda un golpe pedido cuando todavía no se podía pegar (en
   * el recovery de otro, aterrizando, al final del esquive). Sin esto encadenar
   * golpes exige clavar el frame exacto en que se recupera el control, y los
   * combos existirían en el papel pero no en las manos.
   *
   * Se guarda el botón y la dirección del momento en que se apretó, no la del
   * momento en que sale: tocar abajo + rápido y soltar abajo enseguida tiene que
   * dar el golpe bajo igual. Si es de piso o de aire se decide al salir, porque
   * eso depende de dónde esté el personaje en ese frame.
   */
  readonly attackBuffer: number
  readonly bufferedButton: AttackButton | null
  readonly bufferedAim: Aim
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
    platform: -1,
    dropThrough: 0,
    airJumpsLeft: tuning.airJumps,
    jumpBuffer: 0,
    attackBuffer: 0,
    bufferedButton: null,
    bufferedAim: 'neutral',
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
  draft.platform = -1
  draft.dropThrough = 0
  draft.airJumpsLeft = tuning.airJumps
  draft.jumpBuffer = 0
  draft.attackBuffer = 0
  draft.bufferedButton = null
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
