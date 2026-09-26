/**
 * El bot: un rival de la máquina para cuando no aparece nadie en la cola.
 *
 * No toca la simulación. Mira el `MatchState` y devuelve un byte de input, el
 * mismo que produciría un teclado: la pelea contra el bot es una pelea local
 * más, con el bot en la ranura del rival. Por eso no hace falta el servidor, y
 * por eso tampoco cuenta para nada.
 *
 * Es una función pura sobre su propio estado (`Bot`), con su propio generador
 * con semilla: la misma partida contra el mismo bot da siempre lo mismo, que es
 * lo que permite probarlo en Vitest jugando de verdad.
 *
 * Juega como una persona y no como una máquina: piensa cada tantos frames
 * (tiempo de reacción), se equivoca a veces, y aprieta los botones en pulsos —
 * la sim ataca y salta en el flanco del botón, igual que con una tecla.
 */

import { toPixels } from '../sim/fixed'
import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../sim/input'
import { rngFromSeed, rngNext, type RngState } from '../sim/rng'
import { resistanceOf, type Fighter, type MatchState, type PlayerIndex } from '../sim/state'
import type { World } from '../sim/world'
import {
  chooseRecovery,
  fightCandidates,
  isOffStage,
  planInput,
  planRest,
  recoveryInput,
  scoreFight,
  type Plan,
  type RecoveryPolicy,
} from './lookahead'

import { BOT_LEVEL_LABELS, BOT_LEVEL_ORDER, botLevelOf, type BotLevel } from './levels'

export { BOT_LEVEL_LABELS, BOT_LEVEL_ORDER, botLevelOf, type BotLevel }

export interface BotProfile {
  /** Frames entre una decisión y la siguiente. Es el tiempo de reacción. */
  readonly reaction: number
  /** Probabilidad de pegar cuando el rival está a tiro. */
  readonly aggression: number
  /** Probabilidad de esquivar cuando el rival le está pegando de cerca. */
  readonly dodge: number
  /** Probabilidad de hacer algo que no tiene sentido. */
  readonly mistakes: number
  /**
   * Probabilidad de arrancar el combo (barrida abajo, y después salto y patada)
   * cuando el rival está en el piso a tiro y con poco daño. El resto de la ruta
   * sale de las reglas de siempre: ir a buscarlo al aire y pegarle ahí.
   */
  readonly combo: number
  /**
   * Pelea mirando para adelante: prueba cada opción con la sim y elige la
   * mejor, en vez de seguir reglas. Es lo que hace al difícil.
   */
  readonly lookahead: boolean
}

/**
 * El fácil es el bot con el que se jugó desde el principio: se le gana con
 * práctica. El medio reacciona el doble de rápido y casi no se equivoca. El
 * difícil ya no sigue reglas: se imagina cada opción con la sim y elige la que
 * más le conviene, cada pocos frames. Los tres juegan con la misma física y los
 * mismos golpes — lo que cambia es cómo deciden, no hay trampa.
 *
 * Los tres vuelven al escenario igual de bien: caerse solo no es "fácil", es
 * un bot roto.
 */
export const BOT_LEVELS: Record<BotLevel, BotProfile> = {
  easy: { reaction: 12, aggression: 0.7, dodge: 0.18, mistakes: 0.12, combo: 0.15, lookahead: false },
  medium: { reaction: 6, aggression: 0.92, dodge: 0.4, mistakes: 0.03, combo: 0.4, lookahead: false },
  hard: { reaction: 3, aggression: 1, dodge: 1, mistakes: 0.02, combo: 0, lookahead: true },
}


export interface Bot {
  readonly profile: BotProfile
  readonly rng: RngState
  /** Frames que faltan para volver a pensar. */
  readonly cooldown: number
  /** El movimiento que sostiene entre decisión y decisión (sólo izquierda/derecha). */
  readonly move: Input
  /** Frames desde el último salto: los saltos de aire se espacian para que rindan. */
  readonly sinceJump: number
  /** Lo que apretó el frame anterior, para soltar antes de volver a apretar. */
  readonly previous: Input
  /** Cómo está volviendo al escenario, y cuándo lo vuelve a pensar. */
  readonly recovery: RecoveryPolicy | null
  readonly recoveryAge: number
  /** El plan del difícil y por qué frame va. */
  readonly plan: Plan | null
  readonly planFrame: number
}

export function createBot(seed: number, level: BotLevel = 'easy'): Bot {
  return {
    profile: BOT_LEVELS[level],
    rng: rngFromSeed(seed),
    cooldown: 0,
    move: NONE,
    sinceJump: 99,
    previous: NONE,
    recovery: null,
    recoveryAge: 0,
    plan: null,
    planFrame: 0,
  }
}

/** Cada cuántos frames se vuelve a pensar cómo volver: la situación cambia al saltar. */
const RECOVERY_REPLAN = 8
/** Distancia (px) a la que un golpe rápido llega: el alcance de la caja menos un margen. */
const STRIKE_RANGE = 40
const STRIKE_HEIGHT = 45
/** No se acerca a menos de esto del borde caminando: caerse solo no es una estrategia. */
const EDGE_MARGIN = 22

interface Rolled {
  rng: RngState
  value: number
}

/** Un número en [0, 1) del generador del bot. */
function roll(rng: RngState): Rolled {
  const next = rngNext(rng)
  return { rng: next, value: next / 4294967296 }
}

function towards(from: number, to: number): Input {
  return to > from ? RIGHT : LEFT
}

/**
 * El input del bot para este frame. `me` es la ranura que maneja el bot.
 * Devuelve el bot actualizado: es inmutable, como el estado del match.
 */
export function botStep(
  bot: Bot,
  state: MatchState,
  me: PlayerIndex,
  world: World,
): { bot: Bot; input: Input } {
  const self = state.fighters[me]
  const rival = state.fighters[me === 0 ? 1 : 0]
  const out = (patch: Partial<Bot>, input: Input) => {
    // Un botón que ya estaba apretado se suelta antes de volver a apretarlo: la
    // sim reacciona al flanco, y mantenerlo no hace nada.
    const pulses = JUMP | LIGHT | HEAVY | DODGE
    const clean = input & ~(bot.previous & pulses)
    const jumped = (clean & JUMP) !== 0
    return {
      bot: {
        ...bot,
        ...patch,
        sinceJump: jumped ? 0 : Math.min(bot.sinceJump + 1, 99),
        previous: clean,
      },
      input: clean,
    }
  }

  // Muerto o esperando para reaparecer: no hay nada que apretar.
  if (self.state === 'dead' || self.state === 'respawn' || state.over) return out({ recovery: null, plan: null }, NONE)

  const stage = world.stage
  const left = toPixels(stage.ground.left)
  const right = toPixels(stage.ground.right)
  const x = toPixels(self.x)

  // --- 1. Afuera del escenario (o colgado): volver es lo único que importa. --
  // Se revisa en cada frame, sin tiempo de reacción, y se prueban con la sim
  // varias formas de volver: un bot que se cae solo no es un rival, es un chiste.
  if ((isOffStage(self, world) || self.state === 'cling') && self.hitstun === 0) {
    let recovery = bot.recovery
    let age = bot.recoveryAge + 1
    if (!recovery || age >= RECOVERY_REPLAN) {
      recovery = chooseRecovery(state, me, world, bot.sinceJump)
      age = 0
    }
    const input = recoveryInput(recovery, self, bot.sinceJump, world)
    return out({ recovery, recoveryAge: age, cooldown: 0, move: NONE, plan: null }, input)
  }
  const back = { recovery: null, recoveryAge: 0 }

  if (bot.profile.lookahead) return lookaheadStep(bot, state, me, world, out, back)

  // --- 2. En el escenario: pensar cada tanto. --------------------------------
  if (bot.cooldown > 0) {
    return out({ ...back, cooldown: bot.cooldown - 1 }, safeMove(bot.move, self, x, left, right))
  }

  let rng = bot.rng
  const next = (): number => {
    const r = roll(rng)
    rng = r.rng
    return r.value
  }

  const { profile } = bot
  const y = toPixels(self.y)
  const cooldown = profile.reaction + Math.floor(next() * (profile.reaction / 2 + 1))
  const rx = toPixels(rival.x)
  const ry = toPixels(rival.y)
  const dx = rx - x
  const dist = Math.abs(dx)
  const dy = ry - y // negativo: el rival está más arriba
  const toward = towards(x, rx)
  const home = towards(x, (left + right) / 2)

  if (rival.state === 'dead') {
    return out({ ...back, rng, cooldown, move: NONE }, NONE)
  }

  // A veces hace cualquier cosa: sin errores, el bot se siente una pared.
  if (next() < profile.mistakes) {
    const move = next() < 0.5 ? NONE : next() < 0.5 ? LEFT : RIGHT
    return out({ ...back, rng, cooldown, move }, safeMove(move, self, x, left, right))
  }

  // Esquivar un golpe que viene de cerca. En el piso, en el lugar: el esquive
  // con dirección resbala más de 200 px, y hacia afuera es tirarse del borde.
  // En el aire, hacia el centro, por lo mismo.
  if (rival.state === 'attack' && dist < 60 && next() < profile.dodge) {
    return out({ ...back, rng, cooldown, move: NONE }, self.grounded ? DODGE : DODGE | home)
  }

  // En el aire, arriba del rival que está abajo y cerca: el pisotón (spike).
  if (!self.grounded && dy > 15 && dy < 70 && dist < 30 && next() < profile.aggression) {
    return out({ ...back, rng, cooldown, move: NONE }, DOWN | LIGHT)
  }

  // A tiro: pegar, con la dirección que corresponde a dónde está el rival.
  if (dist <= STRIKE_RANGE && Math.abs(dy) <= STRIKE_HEIGHT && next() < profile.aggression) {
    const weak = resistanceOf(rival, world.rules) < world.rules.maxResistance * 0.4
    const heavyChance = weak ? 0.5 : 0.15
    const heavy = self.grounded && next() < heavyChance
    // Arriba: el golpe neutro, que pega para arriba (jab o gancho).
    if (dy < -25) return out({ ...back, rng, cooldown, move: NONE }, heavy ? HEAVY : LIGHT)
    // En el piso, los dos parados y con poco daño: la barrida que arranca el combo.
    const fresh = rival.damage < 40
    if (!heavy && self.grounded && rival.grounded && fresh && next() < profile.combo) {
      return out({ ...back, rng, cooldown: Math.min(cooldown, 8), move: NONE }, DOWN | LIGHT)
    }
    return out({ ...back, rng, cooldown, move: NONE }, toward | (heavy ? HEAVY : LIGHT))
  }

  // Parado en una flotante y el rival abajo: bajarse a buscarlo.
  if (self.grounded && self.platform >= 0 && dy > 50 && next() < 0.7) {
    return out({ ...back, rng, cooldown, move: NONE }, DOWN)
  }

  // El rival está arriba cerca (saltó, o lo levantó la barrida): ir a buscarlo
  // al aire. Si está aturdido es el combo, y se va siempre.
  if (self.grounded && dy < -50 && dist < 90 && (rival.hitstun > 0 || next() < 0.5)) {
    return out({ ...back, rng, cooldown, move: toward }, toward | JUMP)
  }

  // Si no, acercarse. Pegado, quedarse: caminar a través del rival no suma.
  const move = dist < 24 ? NONE : toward
  return out({ ...back, rng, cooldown, move }, safeMove(move, self, x, left, right))
}

type Out = (patch: Partial<Bot>, input: Input) => { bot: Bot; input: Input }

/**
 * El difícil: cada `reaction` frames prueba todas sus opciones con la sim y se
 * queda con la mejor; entre decisión y decisión sigue el plan elegido. Se
 * equivoca muy de vez en cuando, para que se le pueda ganar.
 */
function lookaheadStep(
  bot: Bot,
  state: MatchState,
  me: PlayerIndex,
  world: World,
  out: Out,
  back: Partial<Bot>,
): { bot: Bot; input: Input } {
  const self = state.fighters[me]
  const rival = state.fighters[me === 0 ? 1 : 0]

  if (bot.plan && bot.cooldown > 0) {
    const input = planInput(bot.plan, bot.planFrame)
    return out({ ...back, cooldown: bot.cooldown - 1, planFrame: bot.planFrame + 1 }, input)
  }

  let rng = bot.rng
  const next = (): number => {
    const r = roll(rng)
    rng = r.rng
    return r.value
  }

  const current = bot.plan ? planRest(bot.plan, bot.planFrame) : null
  const candidates = fightCandidates(self, rival, world, current)
  let chosen: Plan
  if (rival.state === 'dead') {
    const x = toPixels(self.x)
    const center = (toPixels(world.stage.ground.left) + toPixels(world.stage.ground.right)) / 2
    chosen = { steps: [], hold: Math.abs(x - center) < 40 ? NONE : towards(x, center) }
  } else if (next() < bot.profile.mistakes) {
    chosen = candidates[Math.floor(next() * candidates.length)]!
  } else {
    chosen = candidates[0]!
    let best = -Infinity
    for (const plan of candidates) {
      // Un poquito de ruido para desempatar: dos opciones iguales no siempre
      // se eligen igual, y así no es previsible.
      const score = scoreFight(state, me, world, plan) + next() * 0.5
      if (score > best) {
        best = score
        chosen = plan
      }
    }
  }

  const cooldown = bot.profile.reaction - 1 + Math.floor(next() * 2)
  return out({ ...back, rng, cooldown, plan: chosen, planFrame: 1 }, planInput(chosen, 0))
}

/** No camina por el borde hacia afuera: frena antes de caerse. */
function safeMove(move: Input, self: Fighter, x: number, left: number, right: number): Input {
  if (!self.grounded) return move
  if (move === LEFT && x < left + EDGE_MARGIN) return NONE
  if (move === RIGHT && x > right - EDGE_MARGIN) return NONE
  return move
}
