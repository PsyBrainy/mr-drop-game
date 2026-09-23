import { describe, expect, it } from 'vitest'
import type { KAPLAYCtx } from 'kaplay'
import { drawMatch } from '../fightLocal'
import { OSO } from '../../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../../fight/data/stage'
import { toPixels } from '../../../fight/sim/fixed'
import { initialState } from '../../../fight/sim/state'
import { withFighter } from '../../../fight/__tests__/harness'
import { DEFAULT_RULES, type World } from '../../../fight/sim/world'

/**
 * La vista no decide nada: dibuja el estado. Eso la hace verificable con un `k`
 * de mentira que anota los rectángulos en vez de pintarlos — que es la única
 * forma de cubrirla, porque un canvas de Kaplay no dibuja nada en un test (ni en
 * una pestaña de fondo: el motor pausa su loop cuando no está visible).
 */

interface Rect {
  x: number
  y: number
  width: number
  height: number
  anchor: unknown
}

function stubKaplay(): { k: KAPLAYCtx; rects: Rect[] } {
  const rects: Rect[] = []
  const k = {
    vec2: (x: number, y: number) => ({ x, y }),
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    drawRect: (opt: { pos: { x: number; y: number }; width: number; height: number; anchor?: unknown }) => {
      rects.push({ x: opt.pos.x, y: opt.pos.y, width: opt.width, height: opt.height, anchor: opt.anchor })
    },
  } as unknown as KAPLAYCtx

  return { k, rects }
}

const world: World = {
  stage: SMALL_STAGE,
  tuning: [OSO, OSO],
  rules: DEFAULT_RULES,
}

const VIEW_W = 960
const VIEW_H = 540

/**
 * Cámara centrada y sin zoom: así proyectar es la identidad y las cuentas del
 * test se leen en píxeles de mundo. Que la cámara encuadre bien se verifica
 * aparte, en `camera.test.ts`.
 */
const FLAT = { x: VIEW_W / 2, y: VIEW_H / 2, scale: 1 }

describe('la vista de la pelea', () => {
  it('dibuja el escenario entero y los dos personajes con su barra', () => {
    const state = initialState(world, 1)
    const { k, rects } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    // piso + 2 paredes + 2 zonas de muerte, y por jugador: cuerpo, marca de
    // frente, fondo de la barra y su relleno.
    expect(rects).toHaveLength(5 + 2 * 4)
  })

  it('pone a cada personaje parado sobre el piso', () => {
    const state = initialState(world, 1)
    const { k, rects } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    const bodies = rects.filter((rect) => rect.anchor === 'bot')
    expect(bodies).toHaveLength(2)

    for (const body of bodies) {
      // Ancla abajo: la `y` del rectángulo son los pies, que van sobre el asfalto.
      expect(body.y).toBe(toPixels(SMALL_STAGE.ground.top))
      expect(body.height).toBe(toPixels(OSO.height))
      expect(body.x).toBeGreaterThan(toPixels(SMALL_STAGE.ground.left))
      expect(body.x).toBeLessThan(toPixels(SMALL_STAGE.ground.right))
    }
  })

  it('el escenario entra en la pantalla', () => {
    // Un error de escala o de ancla dibujaría todo afuera del canvas, y desde
    // afuera se ve igual que "no dibuja nada".
    const state = initialState(world, 1)
    const { k, rects } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    const ground = rects[0]
    expect(ground?.x).toBeGreaterThanOrEqual(0)
    expect(ground?.x).toBeLessThan(VIEW_W)
    expect(ground?.y).toBeGreaterThan(0)
    expect(ground?.y).toBeLessThan(VIEW_H)
  })

  it('dibuja la caja del golpe sólo en los frames activos', () => {
    const state = initialState(world, 1)
    const startup = withFighter(state, 0, { state: 'attack', attack: 'heavy', stateFrames: 0 })
    const active = withFighter(state, 0, {
      state: 'attack',
      attack: 'heavy',
      stateFrames: OSO.moves.heavy.startup,
    })

    const quiet = stubKaplay()
    drawMatch(quiet.k, FLAT, startup, startup, 0)

    const swinging = stubKaplay()
    drawMatch(swinging.k, FLAT, active, active, 0)

    // Sin la caja no hay forma de ver el frame data mientras se juega.
    expect(swinging.rects).toHaveLength(quiet.rects.length + 1)
  })

  it('interpola entre ticks, pero no cuando el personaje reapareció', () => {
    const before = initialState(world, 1)
    const moved = {
      ...before,
      fighters: [{ ...before.fighters[0], x: before.fighters[0].x + 256 * 10 }, before.fighters[1]] as const,
    }

    const half = stubKaplay()
    drawMatch(half.k, FLAT, moved, before, 0.5)
    const interpolated = half.rects.filter((rect) => rect.anchor === 'bot')[0]
    expect(interpolated?.x).toBe(toPixels(before.fighters[0].x) + 5)

    // Un salto grande es un respawn: se corta la interpolación para que el
    // muñeco no cruce la pantalla deslizándose desde la zona de muerte.
    const teleported = {
      ...before,
      fighters: [{ ...before.fighters[0], x: before.fighters[0].x + 256 * 400 }, before.fighters[1]] as const,
    }
    const jump = stubKaplay()
    drawMatch(jump.k, FLAT, teleported, before, 0.5)
    const snapped = jump.rects.filter((rect) => rect.anchor === 'bot')[0]
    expect(snapped?.x).toBe(toPixels(teleported.fighters[0].x))
  })
})
