/**
 * Mirar para adelante: el bot se imagina los próximos frames corriendo la sim
 * de verdad, y elige lo que mejor sale.
 *
 * `step()` es pura, así que probar "¿y si salto ahora?" es tan barato como
 * llamarla con un input inventado: no hay que reescribir la física en el bot,
 * ni estimar alcances ni gravedades que después no coinciden. Lo que se
 * imagina es exactamente lo que va a pasar si el rival hace lo que se supone.
 *
 * Se usa para dos cosas:
 * - volver al escenario (todos los niveles): se prueban varias maneras de
 *   gastar los saltos y se usa la primera que aterriza;
 * - pelear (el difícil): se prueban golpes, saltos, esquives y movimientos, y
 *   se elige el que más daño hace sin quedar expuesto.
 */

import { fx, toPixels } from '../sim/fixed'
import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../sim/input'
import type { Fighter, MatchState, PlayerIndex } from '../sim/state'
import { step } from '../sim/tick'
import type { World } from '../sim/world'

/** Una secuencia de inputs: `steps` frame a frame, y después `hold` para siempre. */
export interface Plan {
  readonly steps: readonly Input[]
  readonly hold: Input
}

export function planInput(plan: Plan, frame: number): Input {
  return frame < plan.steps.length ? plan.steps[frame]! : plan.hold
}

/** Lo que queda de un plan después de `frame` frames: para poder seguirlo. */
export function planRest(plan: Plan, frame: number): Plan {
  return { steps: plan.steps.slice(frame), hold: plan.hold }
}

function stepAs(state: MatchState, me: PlayerIndex, mine: Input, theirs: Input, world: World): MatchState {
  return step(state, me === 0 ? [mine, theirs] : [theirs, mine], world)
}

/**
 * Lo que se supone que hace el rival mientras el bot se imagina: seguir
 * caminando para donde caminaba. Los botones no se repiten — un golpe que ya
 * arrancó lo termina la sim sola.
 */
function rivalGuess(rival: Fighter): Input {
  return rival.prevInput & (LEFT | RIGHT)
}

// ---------------------------------------------------------------------------
// Volver al escenario
// ---------------------------------------------------------------------------

/** Afuera del escenario: en el aire y fuera del piso, o debajo de él. */
export function isOffStage(self: Fighter, world: World): boolean {
  if (self.grounded) return false
  const { ground } = world.stage
  return self.x < ground.left || self.x > ground.right || self.y > ground.top + fx(2)
}

/**
 * Una forma de volver. Todas empujan hacia el escenario; cambian en cuándo
 * gastan los saltos, si usan el esquive como envión, y si se meten debajo del
 * piso o esperan a estar a la altura.
 */
export interface RecoveryPolicy {
  /** Salta (cayendo) cuando los pies pasan esta altura, en px. */
  readonly jumpBelow: number
  /** Usa el esquive del aire como envión hacia el escenario si está lejos. */
  readonly dodgeHome: boolean
  /** Si está más abajo que el piso, no se mete debajo: primero sube. */
  readonly climbFirst: boolean
}

const JUMP_GAP = 10

/** El input de una forma de volver, para un frame. */
export function recoveryInput(policy: RecoveryPolicy, self: Fighter, sinceJump: number, world: World): Input {
  const { ground } = world.stage
  const left = toPixels(ground.left)
  const right = toPixels(ground.right)
  const bottom = toPixels(ground.bottom)
  const x = toPixels(self.x)
  const y = toPixels(self.y)
  const center = (left + right) / 2

  if (self.state === 'cling') return JUMP | (self.facing === 1 ? LEFT : RIGHT)

  const under = x >= left && x <= right
  // Debajo del piso no se vuelve "hacia el centro": hay que salir por un costado.
  let home: Input = under ? (x < center ? LEFT : RIGHT) : x < left ? RIGHT : LEFT
  if (!under && policy.climbFirst && y - 40 > bottom) home = NONE

  const gap = under ? 0 : x < left ? left - x : x - right
  const canAirMove = self.airJumpsLeft > 0 && self.state !== 'dodge' && self.hitstun === 0
  if (policy.dodgeHome && canAirMove && gap > 90 && self.vy >= 0 && home !== NONE) {
    return DODGE | home
  }
  const falling = self.vy >= 0
  if (canAirMove && falling && y >= policy.jumpBelow && sinceJump >= JUMP_GAP) return home | JUMP
  return home
}

const RECOVERY_HORIZON = 170

function recoveryPolicies(world: World): RecoveryPolicy[] {
  const top = toPixels(world.stage.ground.top)
  const out: RecoveryPolicy[] = []
  // Primero la que suele andar mejor: saltar recién a la altura del piso.
  for (const jumpBelow of [top + 10, top - 40, top + 60, top - 90, top + 110, top - 150]) {
    for (const dodgeHome of [false, true]) {
      for (const climbFirst of [false, true]) out.push({ jumpBelow, dodgeHome, climbFirst })
    }
  }
  return out
}


/** Qué tan bien sale una forma de volver: aterrizar pronto es lo mejor, morir lo peor. */
function scoreRecovery(
  state: MatchState,
  me: PlayerIndex,
  world: World,
  policy: RecoveryPolicy,
  sinceJump: number,
  horizon: number,
): number {
  let s = state
  let since = sinceJump
  let previous = s.fighters[me].prevInput
  const theirs = rivalGuess(s.fighters[me === 0 ? 1 : 0])
  const stocks = s.fighters[me].stocks
  for (let frame = 0; frame < horizon; frame += 1) {
    const self = s.fighters[me]
    const raw = recoveryInput(policy, self, since, world)
    const input = raw & ~(previous & (JUMP | DODGE))
    since = input & JUMP ? 0 : since + 1
    previous = input
    s = stepAs(s, me, input, theirs, world)
    const after = s.fighters[me]
    if (after.stocks < stocks || after.state === 'dead') return -100000 + frame
    if (after.grounded) return 100000 - frame
  }
  // Ni aterrizó ni murió: vale lo cerca que quedó del borde.
  const self = s.fighters[me]
  const { ground } = world.stage
  const gap = Math.max(0, toPixels(ground.left) - toPixels(self.x), toPixels(self.x) - toPixels(ground.right))
  const depth = Math.max(0, toPixels(self.y) - toPixels(ground.top))
  return -gap - depth
}

/** La mejor forma de volver desde acá, probándolas todas con la sim. */
export function chooseRecovery(state: MatchState, me: PlayerIndex, world: World, sinceJump: number): RecoveryPolicy {
  const policies = recoveryPolicies(world)
  let best = policies[0]!
  let bestScore = -Infinity
  // En cuanto una aterriza, las demás sólo se miran hasta ese frame: si no
  // aterrizan antes, no le ganan. Así pensar cuesta poco aunque sean muchas.
  let horizon = RECOVERY_HORIZON
  for (const policy of policies) {
    const score = scoreRecovery(state, me, world, policy, sinceJump, horizon)
    if (score > bestScore) {
      best = policy
      bestScore = score
      if (score > 0) horizon = 100000 - score
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Pelear
// ---------------------------------------------------------------------------

const FIGHT_HORIZON = 28

function repeat(input: Input, count: number): Input[] {
  return Array.from({ length: count }, () => input)
}

/** Lo que el difícil considera hacer ahora. */
export function fightCandidates(self: Fighter, rival: Fighter, world: World, current: Plan | null): Plan[] {
  const x = self.x
  const toward: Input = rival.x > x ? RIGHT : LEFT
  const away: Input = toward === RIGHT ? LEFT : RIGHT
  const center = (world.stage.ground.left + world.stage.ground.right) / 2
  const home: Input = center > x ? RIGHT : LEFT

  const plans: Plan[] = [
    { steps: [], hold: NONE },
    { steps: [], hold: toward },
    { steps: [], hold: away },
    { steps: [LEFT | LIGHT], hold: NONE },
    { steps: [RIGHT | LIGHT], hold: NONE },
    { steps: [LEFT | HEAVY], hold: NONE },
    { steps: [RIGHT | HEAVY], hold: NONE },
    { steps: [self.grounded ? DODGE : DODGE | home], hold: NONE },
    { steps: [...repeat(toward, 4), toward | LIGHT], hold: NONE },
    { steps: [...repeat(toward, 8), toward | LIGHT], hold: NONE },
    { steps: [...repeat(toward, 6), toward | HEAVY], hold: NONE },
    { steps: [JUMP | toward], hold: toward },
    { steps: [JUMP], hold: NONE },
  ]
  for (const k of [4, 8, 12, 16]) {
    plans.push({ steps: [JUMP | toward, ...repeat(toward, k - 1), toward | LIGHT], hold: toward })
  }
  plans.push({ steps: [JUMP, ...repeat(NONE, 7), toward | LIGHT], hold: NONE })
  if (!self.grounded) plans.push({ steps: [JUMP | toward, ...repeat(toward, 5), toward | LIGHT], hold: home })
  if (self.grounded && self.platform >= 0) plans.push({ steps: [DOWN], hold: NONE })
  if (current) plans.push(current)
  return plans
}

/**
 * Qué tan bueno es un plan: el daño que hace menos el que recibe, un premio
 * grande por sacar al rival y un castigo enorme por caerse. Pegar al aire y
 * quedar vendido cerca del rival también se paga.
 */
export function scoreFight(state: MatchState, me: PlayerIndex, world: World, plan: Plan): number {
  const them: PlayerIndex = me === 0 ? 1 : 0
  const start = state.fighters
  const theirs = rivalGuess(start[them])
  const { ground } = world.stage
  let s = state
  let previous = start[me].prevInput
  let swings = 0
  let knockout = 0
  for (let frame = 0; frame < FIGHT_HORIZON; frame += 1) {
    const raw = planInput(plan, frame)
    const input = raw & ~(previous & (JUMP | LIGHT | HEAVY | DODGE))
    if (input & LIGHT) swings += 4
    if (input & HEAVY) swings += 10
    previous = input
    s = stepAs(s, me, input, theirs, world)
    if (s.fighters[me].stocks < start[me].stocks) return -50000 + frame
    // Sacarlo es lo mejor que puede pasar, pero se sigue mirando: perseguirlo
    // hasta caerse detrás de él no es ganar.
    if (knockout === 0 && s.fighters[them].stocks < start[them].stocks) knockout = 20000 - frame * 10
  }

  const self = s.fighters[me]
  const rival = s.fighters[them]
  // Terminó en el aire cerca del borde: ¿puede volver desde ahí? Se prueba de
  // verdad, con una forma de volver razonable. Si no puede, el plan es un suicidio.
  if (!self.grounded && nearEdge(self, world) && !canLandFrom(s, me, world)) return -40000 + knockout / 100
  const dealt = rival.damage - start[them].damage
  const taken = self.damage - start[me].damage
  let score = knockout + dealt * 12 - taken * 14
  if (dealt === 0) score -= swings

  const outside = (f: Fighter): number =>
    Math.max(0, toPixels(ground.left) - toPixels(f.x), toPixels(f.x) - toPixels(ground.right))
  // Sacarlo del escenario es cómo se gana: vale más cuanto más lejos.
  score += Math.min(outside(rival), 250) * 0.6
  // Quedar afuera es cómo se pierde.
  const myOut = outside(self)
  if (myOut > 0 && !self.grounded) score -= 150 + myOut * 3
  if (self.y > ground.top && !self.grounded) score -= 150

  const dist = Math.abs(toPixels(self.x) - toPixels(rival.x))
  // Terminar un golpe al lado del rival es regalarle uno.
  if (self.state === 'attack' && dist < 70) score -= 12
  // Estar cerca, a distancia de golpe, es donde se pelea.
  score -= Math.abs(dist - 34) * 0.08
  return score
}

const SAFE_HORIZON = 150

function nearEdge(self: Fighter, world: World): boolean {
  const { ground } = world.stage
  const x = toPixels(self.x)
  return x < toPixels(ground.left) + 140 || x > toPixels(ground.right) - 140
}

/** Si desde este estado, volviendo como se debe, aterriza sin morir. */
function canLandFrom(state: MatchState, me: PlayerIndex, world: World): boolean {
  let s = state
  let since = 99
  let previous = s.fighters[me].prevInput
  const stocks = s.fighters[me].stocks
  // Salta recién a la altura del piso: es la forma de volver que más lejos llega.
  const policy: RecoveryPolicy = { jumpBelow: toPixels(world.stage.ground.top) + 10, dodgeHome: false, climbFirst: false }
  for (let frame = 0; frame < SAFE_HORIZON; frame += 1) {
    const self = s.fighters[me]
    if (self.grounded) return true
    // En un golpe o en hitstun no se maneja: se deja correr.
    const raw = self.state === 'attack' ? NONE : recoveryInput(policy, self, since, world)
    const input = raw & ~(previous & (JUMP | DODGE))
    since = input & JUMP ? 0 : since + 1
    previous = input
    s = stepAs(s, me, input, NONE, world)
    if (s.fighters[me].stocks < stocks) return false
  }
  return true
}
