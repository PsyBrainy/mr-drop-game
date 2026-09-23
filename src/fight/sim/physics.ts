/**
 * Integración y piso. Reemplaza a `body()` y `gravity()` de Kaplay, que corren
 * atados al frame de render y no serían reproducibles.
 *
 * Todas las funciones trabajan sobre un borrador y devuelven void: el dueño del
 * clon es `tick.ts`, y el orden en que se llaman es parte del determinismo, así
 * que no pueden decidirlo ellas.
 */

import { fxApproach, fxClamp, FX_ZERO, type Fx } from './fixed'
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

export function applyGravity(draft: FighterDraft, tuning: FighterTuning): void {
  if (draft.grounded) return
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
export function moveAndCollide(draft: FighterDraft, tuning: FighterTuning, stage: Stage): void {
  const previousY = draft.y

  draft.x += draft.vx
  draft.y += draft.vy

  const overGround = isOverGround(draft.x, tuning, stage)

  if (draft.grounded) {
    // Caminar de más por el borde: no hay pared, hay vacío.
    if (!overGround) {
      draft.grounded = false
      return
    }
    draft.y = stage.ground.top
    draft.vy = FX_ZERO
    return
  }

  const crossedFloor = previousY <= stage.ground.top && draft.y >= stage.ground.top
  if (draft.vy >= 0 && crossedFloor && overGround) {
    draft.y = stage.ground.top
    draft.vy = FX_ZERO
    draft.grounded = true
    draft.airJumpsLeft = tuning.airJumps
  }
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
