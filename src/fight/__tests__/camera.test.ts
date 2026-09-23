import { describe, expect, it } from 'vitest'
import { approachCamera, initialCamera, project, targetCamera } from '../camera'
import { SMALL_STAGE } from '../data/stage'
import { OSO } from '../data/characters/oso'
import { fx, toPixels } from '../sim/fixed'
import { initialState } from '../sim/state'
import { testWorld, withFighter } from './harness'

const world = testWorld()
const VIEW = { width: 960, height: 540 }

function placed(x0: number, y0: number, x1: number, y1: number) {
  let state = initialState(world, 1)
  state = withFighter(state, 0, { x: fx(x0), y: fx(y0), grounded: false, state: 'air' })
  state = withFighter(state, 1, { x: fx(x1), y: fx(y1), grounded: false, state: 'air' })
  return state
}

/** ¿El personaje entero entra en la pantalla? */
function onScreen(camera: ReturnType<typeof targetCamera>, x: number, y: number): boolean {
  const feet = project(camera, VIEW, x, y)
  const head = project(camera, VIEW, x, y - toPixels(OSO.height))
  const margin = toPixels(OSO.halfWidth) * camera.scale
  return (
    feet.x - margin >= 0 &&
    feet.x + margin <= VIEW.width &&
    head.y >= 0 &&
    feet.y <= VIEW.height
  )
}

describe('la cámara', () => {
  /**
   * La razón de existir de todo esto: no importa dónde estén los dos, los dos
   * se tienen que ver. Seguir a uno sin perder al otro es la misma cuenta.
   */
  it('mantiene a los dos en pantalla en cualquier parte del escenario', () => {
    const spots = [200, 340, 480, 620, 760]
    const heights = [120, 300, 420, 560]

    for (const x0 of spots) {
      for (const x1 of spots) {
        for (const y of heights) {
          const state = placed(x0, y, x1, 420)
          const camera = targetCamera(state, world, VIEW)

          expect(onScreen(camera, x0, y)).toBe(true)
          expect(onScreen(camera, x1, 420)).toBe(true)
        }
      }
    }
  })

  it('se aleja cuando se separan y se acerca cuando se juntan', () => {
    const together = targetCamera(placed(460, 420, 500, 420), world, VIEW)
    const apart = targetCamera(placed(220, 420, 740, 420), world, VIEW)

    expect(apart.scale).toBeLessThan(together.scale)
  })

  it('el encuadre no se va más allá de las zonas de muerte', () => {
    // Afuera no hay nada dibujado: mostrar vacío no ayuda a nadie.
    const cornered = targetCamera(placed(-30, 420, 0, 420), world, VIEW)
    const half = VIEW.width / (2 * cornered.scale)

    expect(cornered.x - half).toBeGreaterThanOrEqual(toPixels(SMALL_STAGE.blastLeft) - 1)
  })

  it('sigue al que queda vivo cuando el otro ya salió', () => {
    // Bien separados, para que con los dos vivos la cámara esté alejada de verdad.
    let state = placed(200, 420, 760, 420)
    const both = targetCamera(state, world, VIEW)
    state = withFighter(state, 1, { state: 'dead' })

    const camera = targetCamera(state, world, VIEW)

    expect(onScreen(camera, 200, 420)).toBe(true)
    // Al que salió ya no lo tiene en cuenta, así que puede volver a acercarse.
    expect(camera.scale).toBeGreaterThan(both.scale)
  })

  it('el seguimiento es blando: se acerca sin saltar', () => {
    const start = initialCamera(world, VIEW)
    const target = targetCamera(placed(200, 200, 760, 500), world, VIEW)

    const oneStep = approachCamera(start, target)
    expect(Math.abs(oneStep.x - target.x)).toBeLessThan(Math.abs(start.x - target.x) + 1)

    let camera = start
    for (let frame = 0; frame < 120; frame += 1) camera = approachCamera(camera, target)
    expect(camera.x).toBeCloseTo(target.x, 1)
    expect(camera.scale).toBeCloseTo(target.scale, 2)
  })
})
