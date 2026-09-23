/**
 * Integración y piso. Reemplaza a `body()` y `gravity()` de Kaplay, que corren
 * atados al frame de render y no serían reproducibles.
 *
 * Todas las funciones trabajan sobre un borrador y devuelven void: el dueño del
 * clon es `tick.ts`, y el orden en que se llaman es parte del determinismo, así
 * que no pueden decidirlo ellas.
 */

import { fxAbs, fxApproach, fxClamp, FX_ZERO, type Fx } from './fixed'
import type { FighterDraft } from './state'
import type { FighterTuning, Stage } from './world'

/**
 * Aceleración horizontal. En el piso se acelera hasta `walkSpeed` y se frena con
 * `groundFriction` al soltar; en el aire se usa `airDrift` (más suave) contra un
 * techo más alto. Esa diferencia es casi toda la sensación de un juego de
 * plataformas: el piso responde, el aire flota.
 */
export function accelerate(draft: FighterDraft, tuning: FighterTuning, direction: -1 | 0 | 1): void {
  if (draft.grounded) {
    const target = tuning.walkSpeed * direction
    const step = direction === 0 ? tuning.groundFriction : tuning.groundAccel
    draft.vx = fxApproach(draft.vx, target, step)
    return
  }

  // En el aire, soltar la dirección no frena: se conserva la inercia. Es lo que
  // permite que un golpe te mande volando y el vuelo signifique algo.
  if (direction === 0) return

  const target = tuning.airSpeed * direction
  // El techo del aire no recorta la inercia que ya traés: si venís más rápido
  // que `airSpeed` por un knockback, la deriva sólo puede frenarte o mantenerte.
  if (draft.vx * direction >= target * direction) return
  draft.vx = fxApproach(draft.vx, target, tuning.airDrift)
}

/**
 * Frena el empuje de un golpe. Se aplica sólo a la velocidad que supera lo que
 * el personaje podría alcanzar por sus propios medios: así el vuelo por un
 * knockback se va apagando y el movimiento normal por el aire no se entera.
 *
 * Es lo que hace que el daño acumulado se sienta: con 0 de daño el golpe te
 * mueve un poco y frena; con 100, te manda al otro lado de la pantalla.
 */
export function decayKnockback(draft: FighterDraft, tuning: FighterTuning): void {
  if (draft.grounded) return
  if (fxAbs(draft.vx) <= tuning.airSpeed) return
  const limit = draft.vx > 0 ? tuning.airSpeed : -tuning.airSpeed
  draft.vx = fxApproach(draft.vx, limit, tuning.knockbackDecay)
}

export function applyGravity(draft: FighterDraft, tuning: FighterTuning): void {
  if (draft.grounded) return
  // Colgado de la pared no cae: resbala a su propio ritmo.
  if (draft.state === 'cling') return
  draft.vy = fxClamp(draft.vy + tuning.gravity, -tuning.maxFall, tuning.maxFall)
}

/**
 * Mueve y resuelve la plataforma.
 *
 * El piso se detecta por CRUCE (dónde estaba y dónde quedó), no preguntando si
 * la posición nueva está adentro de algo. Es la diferencia entre aterrizar
 * siempre y atravesar el piso cuando la velocidad de caída es más grande que el
 * grosor de la plataforma — el bug clásico de túnel, que en un juego online
 * además sería un desync si un peer lo sufre un frame antes que el otro. Así el
 * `maxFall` se puede subir todo lo que haga falta sin miedo.
 */
export interface MoveResult {
  /** Acaba de tocar el piso en este frame. */
  readonly landed: boolean
  /**
   * Contra qué costado se frenó, visto desde el personaje: 1 si la pared quedó a
   * su derecha, -1 si quedó a su izquierda, 0 si no tocó ninguna.
   */
  readonly wall: -1 | 0 | 1
}

export function moveAndCollide(
  draft: FighterDraft,
  tuning: FighterTuning,
  stage: Stage,
): MoveResult {
  const previousY = draft.y
  const previousX = draft.x

  draft.x += draft.vx
  draft.y += draft.vy

  const overGround = isOverGround(draft.x, tuning, stage)

  if (draft.grounded) {
    // Caminar de más por el borde: no hay pared arriba, hay vacío.
    if (!overGround) draft.grounded = false
    else {
      draft.y = stage.ground.top
      draft.vy = FX_ZERO
    }
    return { landed: false, wall: 0 }
  }

  const crossedFloor = previousY <= stage.ground.top && draft.y >= stage.ground.top
  if (draft.vy >= 0 && crossedFloor && overGround) {
    draft.y = stage.ground.top
    draft.vy = FX_ZERO
    draft.grounded = true
    draft.airJumpsLeft = tuning.airJumps
    draft.clingLeft = tuning.wall.clingFrames
    return { landed: true, wall: 0 }
  }

  return { landed: false, wall: hitWall(draft, tuning, stage, previousX) }
}

/**
 * Los costados de la plataforma, por cruce igual que el piso: importa de qué
 * lado estaba y de qué lado quedó, no si terminó adentro. Con la caja de
 * colisión sola, a velocidad de knockback se atravesaría la pared entera en un
 * frame — y en red eso es un peer que ve el choque y otro que no.
 */
function hitWall(
  draft: FighterDraft,
  tuning: FighterTuning,
  stage: Stage,
  previousX: Fx,
): -1 | 0 | 1 {
  const { left, right, top, bottom } = stage.ground
  // El cuerpo tiene que estar a la altura del canto: más arriba no hay pared
  // (ahí se aterriza) y más abajo la plataforma ya se terminó.
  const head = draft.y - tuning.height
  if (head >= bottom || draft.y <= top) return 0

  if (previousX + tuning.halfWidth <= left && draft.x + tuning.halfWidth > left) {
    draft.x = left - tuning.halfWidth
    draft.vx = FX_ZERO
    return 1
  }

  if (previousX - tuning.halfWidth >= right && draft.x - tuning.halfWidth < right) {
    draft.x = right + tuning.halfWidth
    draft.vx = FX_ZERO
    return -1
  }

  return 0
}

/** Se quedó sin pared: el cuerpo entero pasó por debajo del canto. */
export function slidOffWall(draft: FighterDraft, tuning: FighterTuning, stage: Stage): boolean {
  return draft.y - tuning.height >= stage.ground.bottom
}

/**
 * Se puede quedar parado con medio cuerpo afuera de la plataforma: el borde se
 * extiende por el medio ancho del personaje. Quedar colgado del filo es parte
 * del juego, no un error de medición.
 */
export function isOverGround(x: Fx, tuning: FighterTuning, stage: Stage): boolean {
  return x >= stage.ground.left - tuning.halfWidth && x <= stage.ground.right + tuning.halfWidth
}

export function isOutOfBounds(draft: FighterDraft, tuning: FighterTuning, stage: Stage): boolean {
  if (draft.x < stage.blastLeft || draft.x > stage.blastRight) return true
  if (draft.y > stage.blastBottom) return true
  // Arriba se mide por la cabeza: el origen está en los pies.
  return draft.y - tuning.height < stage.blastTop
}
