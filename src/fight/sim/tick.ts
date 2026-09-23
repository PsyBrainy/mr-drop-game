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

import { axis, JUMP, pressed, type Input } from './input'
import { accelerate, applyGravity, isOutOfBounds, moveAndCollide } from './physics'
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
    integrate(draft.fighters[index], world.tuning[index], world)
  }

  // 4. Instanciar hitboxes según el frame data del frame actual  ─┐
  // 5. Resolver golpes: (0 → 1), (1 → 0), y recién después clash  ├─ M2
  // 6. Knockback e hitstun escalados por daño acumulado           ─┘

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
}

function applyInput(draft: FighterDraft, input: Input, tuning: FighterTuning): void {
  if (draft.state === 'dead') return

  // El salto se anota siempre, incluso sin poder saltar: para eso está el buffer.
  if (pressed(draft.prevInput, input, JUMP)) draft.jumpBuffer = tuning.jumpBufferFrames

  if (draft.hitstun > 0) return

  const direction = axis(input)
  accelerate(draft, tuning, direction)
  // Se da vuelta sólo en el piso: en el aire el personaje conserva la pose, que
  // es lo que hace legible hacia dónde va a pegar cuando caiga.
  if (direction !== 0 && draft.grounded) draft.facing = direction

  if (draft.jumpBuffer > 0) jump(draft, tuning)
}

function jump(draft: FighterDraft, tuning: FighterTuning): void {
  if (draft.grounded) {
    draft.vy = tuning.jumpVelocity
    draft.grounded = false
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

function integrate(draft: FighterDraft, tuning: FighterTuning, world: World): void {
  const wasAirborne = !draft.grounded

  applyGravity(draft, tuning)
  moveAndCollide(draft, tuning, world.stage)

  if (wasAirborne && draft.grounded) enter(draft, 'land')
  else if (!wasAirborne && !draft.grounded) enter(draft, 'air')

  if (draft.hitstun > 0) return

  if (draft.state === 'land' && draft.stateFrames >= tuning.landFrames) enter(draft, 'idle')

  // Idle contra walk es una distinción de la vista, pero se resuelve acá para que
  // las dos simulaciones tengan el mismo estado y el hash no dependa del render.
  if (draft.grounded && (draft.state === 'idle' || draft.state === 'walk')) {
    enter(draft, draft.vx !== 0 ? 'walk' : 'idle')
  }
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
