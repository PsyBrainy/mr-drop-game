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

export type BotLevel = 'easy' | 'normal' | 'hard'

export interface BotProfile {
  /** Frames entre una decisión y la siguiente. Es el tiempo de reacción. */
  readonly reaction: number
  /** Probabilidad de pegar cuando el rival está a tiro. */
  readonly aggression: number
  /** Probabilidad de esquivar cuando el rival le está pegando de cerca. */
  readonly dodge: number
  /** Probabilidad de hacer algo que no tiene sentido. */
  readonly mistakes: number
}

export const BOT_LEVELS: Record<BotLevel, BotProfile> = {
  easy: { reaction: 20, aggression: 0.45, dodge: 0.05, mistakes: 0.3 },
  normal: { reaction: 12, aggression: 0.7, dodge: 0.18, mistakes: 0.12 },
  hard: { reaction: 7, aggression: 0.9, dodge: 0.35, mistakes: 0.04 },
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
}

export function createBot(seed: number, level: BotLevel = 'normal'): Bot {
  return {
    profile: BOT_LEVELS[level],
    rng: rngFromSeed(seed),
    cooldown: 0,
    move: NONE,
    sinceJump: 99,
    previous: NONE,
  }
}

/** Cuánto hay que esperar entre saltos de aire volviendo al escenario. */
const RECOVERY_JUMP_GAP = 18
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

  if (self.state === 'dead' || state.over) return out({}, NONE)

  const stage = world.stage
  const left = toPixels(stage.ground.left)
  const right = toPixels(stage.ground.right)
  const top = toPixels(stage.ground.top)
  const x = toPixels(self.x)
  const y = toPixels(self.y)

  // --- 1. Colgado de la pared: salto de pared, siempre. --------------------
  if (self.state === 'cling') return out({ move: NONE }, JUMP)

  // --- 2. Afuera del escenario: volver es lo único que importa. -------------
  // Se revisa en cada frame, sin tiempo de reacción: un bot que se cae solo no
  // es un rival, es un chiste.
  const offStage = !self.grounded && (x < left || x > right || y > top + 2)
  if (offStage && self.hitstun === 0) {
    const home = x < left ? RIGHT : x > right ? LEFT : towards(x, (left + right) / 2)
    const falling = self.vy >= 0
    const canJump = self.airJumpsLeft > 0 && bot.sinceJump >= RECOVERY_JUMP_GAP
    return out({ move: home, cooldown: 0 }, home | (falling && canJump ? JUMP : NONE))
  }

  // --- 3. En el escenario: pensar cada tanto. --------------------------------
  if (bot.cooldown > 0) {
    return out({ cooldown: bot.cooldown - 1 }, safeMove(bot.move, self, x, left, right))
  }

  let rng = bot.rng
  const next = (): number => {
    const r = roll(rng)
    rng = r.rng
    return r.value
  }

  const { profile } = bot
  const cooldown = profile.reaction + Math.floor(next() * (profile.reaction / 2 + 1))
  const rx = toPixels(rival.x)
  const ry = toPixels(rival.y)
  const dx = rx - x
  const dist = Math.abs(dx)
  const dy = ry - y // negativo: el rival está más arriba
  const toward = towards(x, rx)
  const away = toward === RIGHT ? LEFT : RIGHT

  if (rival.state === 'dead') {
    return out({ rng, cooldown, move: NONE }, NONE)
  }

  // A veces hace cualquier cosa: sin errores, el bot se siente una pared.
  if (next() < profile.mistakes) {
    const move = next() < 0.5 ? NONE : next() < 0.5 ? LEFT : RIGHT
    return out({ rng, cooldown, move }, safeMove(move, self, x, left, right))
  }

  // Esquivar un golpe que viene de cerca.
  if (rival.state === 'attack' && dist < 60 && next() < profile.dodge) {
    return out({ rng, cooldown, move: NONE }, DODGE | away)
  }

  // A tiro: pegar. El fuerte cuando al rival le queda poca resistencia, que es
  // cuando manda afuera; el rápido el resto del tiempo.
  if (dist <= STRIKE_RANGE && Math.abs(dy) <= STRIKE_HEIGHT && next() < profile.aggression) {
    const weak = resistanceOf(rival, world.rules) < world.rules.maxResistance * 0.4
    const heavyChance = weak ? 0.5 : 0.15
    const button = self.grounded && next() < heavyChance ? HEAVY : LIGHT
    return out({ rng, cooldown, move: NONE }, toward | button)
  }

  // Parado en una flotante y el rival abajo: bajarse a buscarlo.
  if (self.grounded && self.platform >= 0 && dy > 50 && next() < 0.7) {
    return out({ rng, cooldown, move: NONE }, DOWN)
  }

  // El rival saltó y está arriba cerca: ir a buscarlo al aire.
  if (self.grounded && dy < -50 && dist < 90 && next() < 0.5) {
    return out({ rng, cooldown, move: toward }, toward | JUMP)
  }

  // Si no, acercarse. Pegado, quedarse: caminar a través del rival no suma.
  const move = dist < 24 ? NONE : toward
  return out({ rng, cooldown, move }, safeMove(move, self, x, left, right))
}

/** No camina por el borde hacia afuera: frena antes de caerse. */
function safeMove(move: Input, self: Fighter, x: number, left: number, right: number): Input {
  if (!self.grounded) return move
  if (move === LEFT && x < left + EDGE_MARGIN) return NONE
  if (move === RIGHT && x > right - EDGE_MARGIN) return NONE
  return move
}
