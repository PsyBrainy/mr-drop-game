/**
 * Quién le pega a quién, y qué pasa cuando los dos pegan en el mismo frame.
 *
 * Está partido en dos a propósito: primero se DETECTAN los golpes mirando el
 * estado de los dos peleadores, y recién después se APLICAN. Si se aplicara
 * sobre la marcha, el primer golpe movería al rival y el segundo se resolvería
 * contra un estado que el otro peer podría no haber visto igual. Detectar y
 * aplicar en pasos separados hace que el orden entre los dos jugadores no
 * cambie el resultado.
 */

import { isActive, type AttackData } from './attack'
import { boxAt, hurtboxOf, overlaps, type Aabb } from './collision'
import { fxAbs, fxMul, FX_ONE, FX_ZERO } from './fixed'
import type { Fighter, MatchDraft, PlayerIndex } from './state'
import { PLAYERS } from './state'
import type { FighterTuning, World } from './world'

export interface PendingHit {
  readonly attacker: PlayerIndex
  readonly defender: PlayerIndex
  readonly attack: AttackData
}

export interface Exchange {
  /** Los golpes que entran este frame. Vacío si no pasó nada o si hubo choque. */
  readonly hits: readonly PendingHit[]
  /** Los dos pegaron a la vez con la misma prioridad: se anulan. */
  readonly clash: boolean
}

const NOTHING: Exchange = { hits: [], clash: false }

/**
 * Invulnerable por reaparecer, o por estar en los frames buenos de un esquive.
 * La ventana del esquive se calcula del estado en vez de guardarse en un
 * contador: un dato menos que pueda quedar distinto entre los dos peers.
 */
export function isInvulnerable(fighter: Fighter, tuning: FighterTuning): boolean {
  if (fighter.invuln > 0) return true
  if (fighter.state !== 'dodge') return false
  return fighter.stateFrames >= tuning.dodge.invulnFrom && fighter.stateFrames <= tuning.dodge.invulnTo
}

/**
 * La caja del golpe, si en este frame hay una. No se instancia nada: la caja es
 * un dato derivado del frame data y del reloj del ataque. Un objeto de verdad
 * habría que crearlo y destruirlo en el frame exacto en los dos peers, y sería
 * una fuente de desync a cambio de nada.
 */
export function activeHitbox(fighter: Fighter, tuning: FighterTuning): Aabb | null {
  if (fighter.state !== 'attack' || fighter.attack === null) return null
  const move = tuning.moves[fighter.attack]
  if (!isActive(move, fighter.stateFrames)) return null
  return boxAt(move.hitbox, fighter.x, fighter.y, fighter.facing)
}

export function detectExchange(draft: MatchDraft, world: World): Exchange {
  const candidates: PendingHit[] = []

  for (const attacker of PLAYERS) {
    const defender: PlayerIndex = attacker === 0 ? 1 : 0
    const hit = candidateHit(draft, world, attacker, defender)
    if (hit) candidates.push(hit)
  }

  const [first, second] = candidates
  if (!first) return NOTHING
  if (!second) return { hits: [first], clash: false }

  // Los dos pegaron en el mismo frame. Gana el de más prioridad; si empatan, se
  // anulan. Que el empate no sea un trade es a propósito: dos golpes que entran
  // a la vez y se mandan a volar a los dos no se lee, y premia apretar a ciegas.
  if (first.attack.priority === second.attack.priority) return { hits: [], clash: true }
  return { hits: [first.attack.priority > second.attack.priority ? first : second], clash: false }
}

function candidateHit(
  draft: MatchDraft,
  world: World,
  attacker: PlayerIndex,
  defender: PlayerIndex,
): PendingHit | null {
  const hitter = draft.fighters[attacker]
  const victim = draft.fighters[defender]
  if (victim.state === 'dead') return null

  const box = activeHitbox(hitter, world.tuning[attacker])
  if (!box || hitter.attack === null) return null
  if (isInvulnerable(victim, world.tuning[defender])) return null
  // Un golpe por swing: la caja está activa varios frames y sin esto pegaría
  // uno por frame.
  if (victim.lastHitBy === hitter.hitId) return null
  if (!overlaps(box, hurtboxOf(victim, world.tuning[defender]))) return null

  return { attacker, defender, attack: world.tuning[attacker].moves[hitter.attack] }
}

export function applyHit(hit: PendingHit, draft: MatchDraft): void {
  const attacker = draft.fighters[hit.attacker]
  const victim = draft.fighters[hit.defender]
  const move = hit.attack

  // El daño se suma ANTES de calcular el empuje: el golpe que te lleva a 100
  // pega como un golpe de 100, no como uno de 92. Es lo que hace que un
  // intercambio largo se vuelva cada vez más peligroso para los dos.
  victim.damage += move.damage

  const factor = FX_ONE + Math.trunc((FX_ONE * move.scaling * victim.damage) / 1000)
  victim.vx = fxMul(move.knockback.x, factor) * attacker.facing
  victim.vy = fxMul(move.knockback.y, factor)
  victim.grounded = false
  victim.platform = -1
  victim.state = 'hitstun'
  victim.stateFrames = 0
  victim.attack = null
  victim.landLag = 0
  victim.lastHitBy = attacker.hitId
  // Lo que había pedido antes del golpe ya no vale: si no, al salir del hitstun
  // soltaría un golpe apretado cuando todavía estaba en otra situación.
  victim.attackBuffer = 0
  victim.bufferedButton = null
  // Te pegaron: te devuelven el recovery, como en Brawlhalla. Si no, un golpe
  // que te saca después de gastarlo sería un KO seguro.
  victim.airMovesUsed = 0
  victim.spiked = move.knockback.y > 0
  // El hitstun crece con el empuje: si no, un golpe que te manda lejos te
  // devolvería el control enseguida y podrías volver antes de que te luzca.
  victim.hitstun = move.hitstun + Math.trunc((fxAbs(victim.vx) + fxAbs(victim.vy)) / FX_ONE / 2)
}

/**
 * Choque: los dos ataques se cancelan y cada uno rebota para atrás. Sin daño y
 * sin hitstun — nadie ganó el intercambio, vuelven a empezar.
 */
export function applyClash(draft: MatchDraft, world: World): void {
  for (const index of PLAYERS) {
    const fighter = draft.fighters[index]
    const move = fighter.attack ? world.tuning[index].moves[fighter.attack] : null
    fighter.attack = null
    fighter.state = fighter.grounded ? 'idle' : 'air'
    fighter.stateFrames = 0
    fighter.vx = move ? -Math.trunc(move.knockback.x / 2) * fighter.facing : FX_ZERO
  }
}
