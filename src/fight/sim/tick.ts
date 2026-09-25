/**
 * El tick. 60 por segundo, fijos, y con las fases en un orden que no se cambia
 * sin pensarlo dos veces: el orden ES el determinismo. Dos peers que resuelvan
 * las mismas cosas en distinto orden llegan a estados distintos con los mismos
 * inputs.
 *
 * Nada de `onCollide`, `wait()` ni `loop()` de Kaplay acá adentro. Esta función
 * no sabe que existe un motor de render: recibe estado e inputs, devuelve estado.
 * Corre igual en el navegador, en Vitest y en Node cuando el servidor re-simula
 * el log para validar quién ganó.
 */

import { airMoveBit, isOver, type MoveKey } from './attack'
import { FX_ZERO } from './fixed'
import { axis, DODGE, DOWN, HEAVY, held, JUMP, LIGHT, pressed, type Input } from './input'
import {
  accelerate,
  applyGravity,
  decayKnockback,
  isOutOfBounds,
  moveAndCollide,
  slidOffWall,
} from './physics'
import { aimOf, moveFor } from './moves'
import { applyClash, applyHit, detectExchange } from './resolve'
import {
  cloneState,
  PLAYERS,
  respawn,
  type FighterDraft,
  type FighterStateName,
  type MatchDraft,
  type MatchState,
  type PlayerIndex,
} from './state'
import type { FighterTuning, World } from './world'

/** Ticks por segundo de la simulación. La vista dibuja a los FPS que dé el navegador. */
export const TICKS_PER_SECOND = 60

/**
 * Frames que se atraviesan las flotantes después de bajarse de una. Alcanza para
 * que los pies pasen el piso de la plataforma (cae 0,9 px/frame² desde quieto:
 * en 10 frames ya bajó ~45 px) y no tanto como para atravesar además la de abajo.
 */
export const DROP_THROUGH_FRAMES = 10

export function step(state: MatchState, inputs: readonly [Input, Input], world: World): MatchState {
  const draft = cloneState(state)

  if (draft.over) {
    // Terminado el match el estado se congela, pero el tick sigue: el replay
    // tiene su propio largo y los clientes siguen mandando input hasta que el
    // servidor cierra la room.
    draft.tick += 1
    return draft
  }

  // 1. Timers
  for (const index of PLAYERS) advanceTimers(draft.fighters[index])

  // 2. Input y máquina de estados, jugador 0 y después jugador 1
  for (const index of PLAYERS) {
    applyInput(draft.fighters[index], inputs[index], world.tuning[index])
  }

  // 3. Física
  for (const index of PLAYERS) {
    integrate(draft.fighters[index], world.tuning[index], world, draft.tick)
  }

  // 4 y 5. Las cajas de golpe salen del frame data y del reloj del ataque, así
  // que no hay nada que instanciar: `detectExchange` las calcula y resuelve los
  // dos pares en orden fijo, más el choque.
  const exchange = detectExchange(draft, world)

  // 6. Aplicar. Separado de la detección: mover a alguien en el medio cambiaría
  // el estado contra el que se resuelve el otro golpe.
  for (const hit of exchange.hits) applyHit(hit, draft)
  if (exchange.clash) applyClash(draft, world)

  // 7. Límites del mundo
  resolveBounds(draft, world)

  // 8. Cerrar el frame
  for (const index of PLAYERS) draft.fighters[index].prevInput = inputs[index]
  draft.tick += 1

  return draft
}

function enter(draft: FighterDraft, state: FighterStateName): void {
  if (draft.state === state) return
  draft.state = state
  draft.stateFrames = 0
}

function advanceTimers(draft: FighterDraft): void {
  draft.stateFrames += 1
  if (draft.hitstun > 0) draft.hitstun -= 1
  if (draft.invuln > 0) draft.invuln -= 1
  if (draft.jumpBuffer > 0) draft.jumpBuffer -= 1
  if (draft.attackBuffer > 0) draft.attackBuffer -= 1
  if (draft.attackBuffer === 0) draft.bufferedButton = null
  if (draft.landLag > 0) draft.landLag -= 1
  if (draft.state === 'cling' && draft.clingLeft > 0) draft.clingLeft -= 1
  if (draft.dropThrough > 0) draft.dropThrough -= 1
}

function applyInput(draft: FighterDraft, input: Input, tuning: FighterTuning): void {
  if (draft.state === 'dead') return

  // El salto y los golpes se anotan siempre, incluso sin poder hacerlos: para eso
  // están los buffers. Si en el mismo frame se aprietan los dos golpes, gana el
  // rápido, como antes de que hubiera buffer.
  if (pressed(draft.prevInput, input, JUMP)) draft.jumpBuffer = tuning.jumpBufferFrames
  const button = pressed(draft.prevInput, input, LIGHT)
    ? 'light'
    : pressed(draft.prevInput, input, HEAVY)
      ? 'heavy'
      : null
  if (button) {
    draft.bufferedButton = button
    draft.bufferedAim = aimOf(input)
    draft.attackBuffer = tuning.attackBufferFrames
  }

  if (draft.hitstun > 0) return

  // Aterrizaste en medio de un aéreo: el castigo por tirar un golpe que no
  // llegó a terminar antes de tocar el piso.
  if (draft.landLag > 0) {
    accelerate(draft, tuning, 0)
    return
  }

  if (draft.state === 'attack') {
    const move = draft.attack === null ? null : tuning.moves[draft.attack]
    if (move && !isOver(move, draft.stateFrames)) {
      if (move.motion && draft.stateFrames === move.motion.frame) {
        draft.vy = move.motion.vy
        if (move.motion.vx !== undefined) draft.vx = move.motion.vx * draft.facing
      }
      // Durante el golpe no se maneja. En el piso frena; en el aire conserva la
      // inercia con la que llegó, que es lo que hace que un aéreo se "tire".
      accelerate(draft, tuning, 0)
      return
    }
    draft.attack = null
    enter(draft, draft.grounded ? 'idle' : 'air')
  }

  if (draft.state === 'dodge') {
    // El esquive conserva su envión hasta el final: sin fricción, si no, el
    // esquive en el aire no llevaría a ningún lado.
    if (draft.stateFrames < tuning.dodge.frames) return
    enter(draft, draft.grounded ? 'idle' : 'air')
  }

  if (draft.state === 'cling') {
    // Colgado sólo se puede hacer dos cosas: saltar o soltarse. Ni golpear ni
    // esquivar — si no, la pared sería el mejor lugar del escenario.
    if (draft.jumpBuffer > 0) {
      wallJump(draft, tuning)
      return
    }
    // Apretar en dirección contraria a la pared es soltarse. La pared quedó del
    // lado opuesto al que mira, así que alcanza con mirar hacia dónde empuja.
    if (axis(input) === draft.facing) {
      enter(draft, 'air')
      return
    }
    return
  }

  // Los golpes van antes que bajarse de la flotante: abajo + golpe arriba de una
  // es el golpe bajo (`dLight`), no bajarse. Bajarse queda para abajo solo.
  if (draft.attackBuffer > 0 && draft.bufferedButton) {
    const key = moveFor(draft.grounded, draft.bufferedButton, draft.bufferedAim)
    draft.attackBuffer = 0
    draft.bufferedButton = null
    // Un golpe de una vez por vuelo ya gastado no sale, y no sale otro en su
    // lugar: apretar fuerte cayendo y que salga algo que no se pidió es peor que
    // no hacer nada. El resto del frame sigue: se puede moverse y saltar.
    if (spendAirMove(draft, tuning, key)) {
      startAttack(draft, key, axis(input))
      return
    }
  }

  // Abajo sobre una plataforma flotante: bajarse atravesándola.
  if (held(input, DOWN) && draft.grounded && draft.platform >= 0) {
    draft.grounded = false
    draft.platform = -1
    draft.dropThrough = DROP_THROUGH_FRAMES
    draft.vy = FX_ZERO
    enter(draft, 'air')
    return
  }

  if (pressed(draft.prevInput, input, DODGE) && startDodge(draft, tuning, axis(input))) return

  const direction = axis(input)
  accelerate(draft, tuning, direction)
  // Se da vuelta sólo en el piso: en el aire el personaje conserva la pose, que
  // es lo que hace legible hacia dónde va a pegar cuando caiga.
  if (direction !== 0 && draft.grounded) draft.facing = direction

  if (draft.jumpBuffer > 0) jump(draft, tuning)
}

/**
 * Arranca un golpe. Cuál golpe lo decide `moveFor` (botón × dirección ×
 * piso/aire); acá sólo se entra al estado.
 */
function startAttack(draft: FighterDraft, key: MoveKey, direction: -1 | 0 | 1): void {
  // Se puede pegar para el otro lado: girar al atacar es lo que evita que
  // quedar de espaldas sea una sentencia.
  if (direction !== 0) draft.facing = direction
  draft.state = 'attack'
  draft.stateFrames = 0
  draft.attack = key
  draft.hitId += 1
  // Los golpes de piso te plantan. En el aire no: ahí mandan la inercia y la gravedad.
  if (draft.grounded) draft.vx = 0
}

/**
 * ¿Se puede tirar este golpe? Si es de una vez por vuelo y se tira en el aire,
 * lo marca como gastado. En el piso no se gasta nada: el vuelo todavía no empezó.
 */
function spendAirMove(draft: FighterDraft, tuning: FighterTuning, key: MoveKey): boolean {
  if (!tuning.moves[key].oncePerAirtime || draft.grounded) return true
  const bit = airMoveBit(key)
  if ((draft.airMovesUsed & bit) !== 0) return false
  draft.airMovesUsed |= bit
  return true
}

/**
 * Esquive. En el aire cuesta un salto: así no se puede flotar esquivando para
 * siempre, y volver al escenario pasa a ser una decisión — gasto el salto en
 * moverme o en cubrirme del golpe que me espera en el borde.
 */
function startDodge(draft: FighterDraft, tuning: FighterTuning, direction: -1 | 0 | 1): boolean {
  if (!draft.grounded) {
    if (draft.airJumpsLeft <= 0) return false
    draft.airJumpsLeft -= 1
  }

  draft.state = 'dodge'
  draft.stateFrames = 0
  draft.attack = null
  draft.vx = tuning.dodge.speed * direction
  draft.vy = 0
  return true
}

/**
 * Salto de pared. No gasta saltos de aire a propósito: es el recurso que te
 * devuelve la pelea cuando ya no te quedaba nada. Lo que lo limita es el
 * presupuesto de frames colgado, que sólo se recarga tocando el piso.
 */
function wallJump(draft: FighterDraft, tuning: FighterTuning): void {
  draft.vx = tuning.wall.jumpX * draft.facing
  draft.vy = tuning.wall.jumpY
  draft.jumpBuffer = 0
  enter(draft, 'air')
}

function jump(draft: FighterDraft, tuning: FighterTuning): void {
  if (draft.grounded) {
    draft.vy = tuning.jumpVelocity
    draft.grounded = false
    draft.platform = -1
    draft.jumpBuffer = 0
    enter(draft, 'air')
    return
  }

  if (draft.airJumpsLeft <= 0) return

  draft.vy = tuning.airJumpVelocity
  draft.airJumpsLeft -= 1
  draft.jumpBuffer = 0
  // Se vuelve a entrar al estado para que el `stateFrames` reinicie y la vista
  // pueda reproducir la animación del salto de nuevo.
  draft.state = 'air'
  draft.stateFrames = 0
}

function integrate(draft: FighterDraft, tuning: FighterTuning, world: World, tick: number): void {
  const wasAirborne = !draft.grounded

  if (draft.state === 'cling') {
    draft.vx = 0
    draft.vy = tuning.wall.slide
  }

  decayKnockback(draft, tuning)
  applyGravity(draft, tuning)
  const moved = moveAndCollide(draft, tuning, world.stage, tick)

  if (draft.state === 'cling') {
    // Se sale de la pared por tiempo o porque se terminó el canto. Las dos
    // salidas dejan al personaje cayendo, que es lo que hace que colgarse sea
    // una pausa y no un refugio.
    if (draft.clingLeft <= 0 || slidOffWall(draft, tuning, world.stage)) enter(draft, 'air')
    if (draft.grounded) enter(draft, 'land')
    return
  }

  if (moved.wall !== 0 && canCling(draft)) {
    enter(draft, 'cling')
    // Mira para el lado contrario a la pared: es de ahí de donde va a saltar.
    draft.facing = moved.wall === 1 ? -1 : 1
    draft.attack = null
    draft.vy = 0
    return
  }

  // En hitstun no hay estados que resolver: el personaje es un proyectil hasta
  // que se le termine.
  if (draft.hitstun > 0) return
  if (draft.state === 'hitstun') {
    enter(draft, draft.grounded ? 'idle' : 'air')
    return
  }

  if (wasAirborne && draft.grounded) {
    if (draft.state === 'attack') {
      draft.landLag = tuning.landFrames
      draft.attack = null
    }
    enter(draft, 'land')
    return
  }

  // Un golpe o un esquive se terminan por su propio reloj, no porque el
  // personaje se haya caído de la plataforma en el medio.
  if (draft.state === 'attack' || draft.state === 'dodge') return

  if (!wasAirborne && !draft.grounded) {
    enter(draft, 'air')
    return
  }

  if (draft.state === 'land' && draft.stateFrames >= tuning.landFrames) enter(draft, 'idle')

  // Idle contra walk es una distinción de la vista, pero se resuelve acá para que
  // las dos simulaciones tengan el mismo estado y el hash no dependa del render.
  if (draft.grounded && (draft.state === 'idle' || draft.state === 'walk')) {
    enter(draft, draft.vx !== 0 ? 'walk' : 'idle')
  }
}

/**
 * En hitstun no hay agarre: un golpe contra la pared no se convierte en salvada
 * gratis. Primero hay que recuperar el control, y recién ahí prenderse.
 */
function canCling(draft: FighterDraft): boolean {
  if (draft.hitstun > 0) return false
  if (draft.clingLeft <= 0) return false
  return draft.state !== 'attack' && draft.state !== 'dodge'
}

function resolveBounds(draft: MatchDraft, world: World): void {
  let losers = 0
  let lastLoser: PlayerIndex = 0

  for (const index of PLAYERS) {
    const fighter = draft.fighters[index]
    if (fighter.state === 'dead') continue
    if (!isOutOfBounds(fighter, world.tuning[index], world.stage)) continue

    fighter.stocks -= 1
    if (fighter.stocks > 0) {
      respawn(fighter, world, index)
      continue
    }

    fighter.state = 'dead'
    fighter.stateFrames = 0
    fighter.vx = 0
    fighter.vy = 0
    fighter.grounded = false
    losers += 1
    lastLoser = index
  }

  if (losers === 0) return

  draft.over = true
  // Los dos afuera en el mismo frame es empate. Pasa: un golpe mutuo en el borde.
  draft.winner = losers === 2 ? null : lastLoser === 0 ? 1 : 0
}
