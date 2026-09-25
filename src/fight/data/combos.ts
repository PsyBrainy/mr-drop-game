/**
 * Medidas de combo: cuánta ventaja deja un golpe y si otro entra atrás sin que
 * el rival pueda hacer nada. Las usan los tests de invariantes y la tabla de
 * `docs/pelea/memoria.md`; nunca el tick.
 *
 * No se calculan con fórmulas sino jugando la sim de verdad: la ventaja depende
 * de cuándo aterriza cada uno, de la fricción, de la inercia del aéreo… y una
 * fórmula que se olvide de algo da un número prolijo y falso. Jugarlo es lento
 * (algunos miles de ticks por medida) y en un test no importa.
 *
 * "Combo real" es la definición de Brawlhalla: el segundo golpe entra mientras
 * el rival sigue en hitstun, o sea sin que haya tenido un solo frame para
 * esquivar, saltar o pegar.
 */

import type { MoveKey } from '../sim/attack'
import { fx, toPixels } from '../sim/fixed'
import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../sim/input'
import { moveFor, type Aim, type AttackButton } from '../sim/moves'
import { initialState, type Fighter, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import type { World } from '../sim/world'

/** Cómo se aprieta un golpe: botón, dirección y si sale en el aire. */
export interface MoveInput {
  readonly aerial: boolean
  readonly button: AttackButton
  readonly aim: Aim
}

/** El casillero de la tabla de `moveFor` de cada golpe (el primero que lo da). */
export function inputOf(key: MoveKey): MoveInput {
  for (const aerial of [false, true]) {
    for (const button of ['light', 'heavy'] as const) {
      for (const aim of ['neutral', 'side', 'down'] as const) {
        if (moveFor(!aerial, button, aim) === key) return { aerial, button, aim }
      }
    }
  }
  throw new Error(`${key} no sale de ningún casillero de la tabla`)
}

/** El byte de input que tira ese golpe, apuntando hacia `toward` si es de costado. */
export function pressFor(key: MoveKey, toward: -1 | 1): Input {
  const { button, aim } = inputOf(key)
  const bit = button === 'light' ? LIGHT : HEAVY
  if (aim === 'down') return bit | DOWN
  if (aim === 'side') return bit | (toward === 1 ? RIGHT : LEFT)
  return bit
}

/** Altura a la que se paran los dos para medir un aéreo. Lejos del piso para que nadie aterrice en el medio. */
const AIR_HEIGHT = fx(160)

/**
 * El 0 a punto de tirar `key` contra el 1, que está justo en el centro de la
 * caja del golpe (los dos en el medio del escenario), mirándolo, con `damage` de daño. Para un aéreo los dos están
 * quietos en el aire a la misma altura: caen igual hasta que el golpe entra.
 */
export function standoff(world: World, key: MoveKey, damage: number): MatchState {
  const move = world.tuning[0].moves[key]
  const aerial = inputOf(key).aerial
  const base = initialState(world, 1)
  // En el medio del escenario y repartidos a los dos lados del centro: ahí no hay
  // flotantes abajo (en el escenario de hoy quedan a los costados), así que un
  // aéreo no aterriza en una en el medio de la medición.
  const center = Math.trunc((world.stage.ground.left + world.stage.ground.right) / 2)
  const x = center - Math.trunc(move.hitbox.dx / 2)
  const y = aerial ? world.stage.ground.top - AIR_HEIGHT : world.stage.ground.top
  const airborne: Partial<Fighter> = aerial ? { grounded: false, state: 'air' } : {}

  const attacker: Fighter = { ...base.fighters[0], x, y, facing: 1, ...airborne }
  const victim: Fighter = { ...base.fighters[1], x: x + move.hitbox.dx, y, facing: -1, damage, ...airborne }
  return { ...base, fighters: [attacker, victim] }
}

export interface Advantage {
  /** Frames que el que pegó puede actuar antes que el rival. Negativo: el rival actúa antes. */
  readonly advantage: number
  /** Distancia horizontal entre los dos, en px, cuando el rival recupera el control. */
  readonly gapPx: number
  /** Cuánto más arriba está el rival que el que pegó, en px, en ese momento. */
  readonly heightPx: number
}

const LIMIT = 240

/** Juega desde `state` con los inputs de `plan` (por tick relativo) y devuelve todos los estados. */
function play(state: MatchState, world: World, frames: number, plan: (tick: number) => readonly [Input, Input]): MatchState[] {
  const states: MatchState[] = []
  let current = state
  for (let tick = 0; tick < frames; tick += 1) {
    current = step(current, plan(tick), world)
    states.push(current)
  }
  return states
}

/** Primer tick en que el golpe de `key` metió hitstun al 1, o -1. */
function firstHit(states: readonly MatchState[]): number {
  return states.findIndex((s) => s.fighters[1].hitstun > 0)
}

/**
 * Ventaja de frames de `key` pegando en su primer frame activo. Se mide
 * probando: el primer tick en que un golpe nuevo del que pegó arranca, contra
 * el primer tick en que un esquive del rival arranca. `null` si el golpe no
 * llega a pegar desde `standoff` (sería un error del frame data).
 */
export function frameAdvantage(world: World, key: MoveKey, damage: number): Advantage | null {
  const start = standoff(world, key, damage)
  const press = pressFor(key, 1)
  const base = play(start, world, LIMIT, (t) => [t < 2 ? press : NONE, NONE])
  const hit = firstHit(base)
  if (hit < 0) return null

  // El que pegó: primer tick en que apretar el rápido arranca otro golpe.
  const attackerFree = firstTick(hit + 1, (t) =>
    play(start, world, t + 1, (tick) => [tick < 2 ? press : tick === t ? LIGHT : NONE, NONE]).at(-1)!
      .fighters[0].hitId === 2,
  )
  // El rival: primer tick en que apretar el esquive lo hace esquivar.
  const victimFree = firstTick(hit + 1, (t) =>
    play(start, world, t + 1, (tick) => [tick < 2 ? press : NONE, tick === t ? DODGE : NONE]).at(-1)!
      .fighters[1].state === 'dodge',
  )

  const at = base[victimFree]!
  const [attacker, victim] = at.fighters
  return {
    advantage: victimFree - attackerFree,
    gapPx: Math.abs(toPixels(victim.x - attacker.x)),
    heightPx: toPixels(attacker.y - victim.y),
  }
}

function firstTick(from: number, works: (tick: number) => boolean): number {
  for (let tick = from; tick < LIMIT; tick += 1) if (works(tick)) return tick
  return LIMIT
}

export interface FollowUp {
  /** El segundo golpe entra con el rival todavía en hitstun. */
  readonly real: boolean
  /** Cómo se hizo, si se pudo: ticks después del primer impacto en que se saltó y se apretó. */
  readonly jumpAt: number | null
  readonly pressAt: number | null
}

const NO_FOLLOW_UP: FollowUp = { real: false, jumpAt: null, pressAt: null }

/**
 * ¿`second` entra atrás de `first` como combo real a este daño? Prueba las
 * formas simples de llegar: ir caminando (o derivando) hacia el rival y
 * apretar en cada tick posible, y para los aéreos además saltar antes en cada
 * tick posible. El rival no hace nada: en hitstun no puede, que es justamente
 * lo que se mide.
 */
export function followsUp(world: World, first: MoveKey, second: MoveKey, damage: number): FollowUp {
  const start = standoff(world, first, damage)
  const firstPress = pressFor(first, 1)
  const opening = play(start, world, LIMIT, (t) => [t < 2 ? firstPress : NONE, NONE])
  const hit = firstHit(opening)
  if (hit < 0) return NO_FOLLOW_UP

  const hitstunEnds = hit + opening[hit]!.fighters[1].hitstun
  const aerial = inputOf(second).aerial
  const jumps: readonly (number | null)[] = aerial ? range(hit + 1, hitstunEnds) : [null]

  for (const jumpAt of jumps) {
    for (let pressAt = (jumpAt ?? hit) + 1; pressAt < hitstunEnds; pressAt += 1) {
      const result = tryRoute(world, start, firstPress, second, jumpAt, pressAt, hitstunEnds)
      if (result) return { real: true, jumpAt: jumpAt === null ? null : jumpAt - hit, pressAt: pressAt - hit }
    }
  }
  return NO_FOLLOW_UP
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i)
}

function tryRoute(
  world: World,
  start: MatchState,
  firstPress: Input,
  second: MoveKey,
  jumpAt: number | null,
  pressAt: number,
  until: number,
): boolean {
  let state = start
  for (let tick = 0; tick <= until; tick += 1) {
    const [attacker, victim] = state.fighters
    const toward: -1 | 1 = victim.x >= attacker.x ? 1 : -1
    const move = toward === 1 ? RIGHT : LEFT
    let input: Input = NONE
    if (tick < 2) input = firstPress
    else if (tick === pressAt) input = pressFor(second, toward)
    else if (tick === jumpAt) input = JUMP | move
    else input = move

    const before = state.fighters[1].hitstun
    state = step(state, [input, NONE], world)
    const now = state.fighters[0]
    // Entró un golpe nuevo (el rival anotó otro hitId) y era el que buscábamos.
    // `before` es el hitstun al empezar el tick: con 1, el rival lo termina en la
    // fase de timers y ya tiene la fase de input para esquivar, así que un combo
    // real necesita que le queden al menos 2.
    if (tick >= pressAt && state.fighters[1].lastHitBy === now.hitId && now.hitId === 2) {
      return now.attack === second && before >= 2
    }
  }
  return false
}
