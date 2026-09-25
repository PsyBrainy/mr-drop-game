import { describe, expect, it } from 'vitest'
import type { KAPLAYCtx } from 'kaplay'
import { drawMatch } from '../fightView'
import { OSO } from '../../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../../fight/data/stage'
import { toPixels } from '../../../fight/sim/fixed'
import { initialState } from '../../../fight/sim/state'
import { withFighter } from '../../../fight/__tests__/harness'
import { DEFAULT_RULES, type World } from '../../../fight/sim/world'
import { ART_SCALE, FEET_Y, FRAME_PX, ORIGIN_X, spriteKey } from '../fightSprites.config'
import { LAYERS, PLATFORM, SKY, SOFT_PLATFORM } from '../fightStage.config'
import { platformAt } from '../../../fight/sim/platforms'

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

interface Sprite {
  sprite: string
  frame: number
  x: number
  y: number
  scale: number
  flipX: boolean
  width?: number
  height?: number
}

/** Los sprites de los peleadores, sin el escenario. */
function fighters(sprites: Sprite[]): Sprite[] {
  return sprites.filter((sprite) => sprite.sprite.startsWith('fight-rasta'))
}

/** Dónde quedan los pies de un sprite dibujado, deshaciendo el origen medido en la hoja. */
function feetOf(sprite: Sprite): { x: number; y: number } {
  const originX = sprite.flipX ? FRAME_PX - ORIGIN_X : ORIGIN_X
  return { x: sprite.x + originX * sprite.scale, y: sprite.y + FEET_Y * sprite.scale }
}

function stubKaplay(): { k: KAPLAYCtx; rects: Rect[]; sprites: Sprite[] } {
  const rects: Rect[] = []
  const sprites: Sprite[] = []
  const k = {
    drawSprite: (opt: {
      sprite: string; frame: number; pos: { x: number; y: number }; scale: number; flipX: boolean
      width?: number; height?: number
    }) => {
      sprites.push({
        sprite: opt.sprite, frame: opt.frame, x: opt.pos.x, y: opt.pos.y, scale: opt.scale, flipX: opt.flipX,
        width: opt.width, height: opt.height,
      })
    },
    vec2: (x: number, y: number) => ({ x, y }),
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    drawRect: (opt: { pos: { x: number; y: number }; width: number; height: number; anchor?: unknown }) => {
      rects.push({ x: opt.pos.x, y: opt.pos.y, width: opt.width, height: opt.height, anchor: opt.anchor })
    },
  } as unknown as KAPLAYCtx

  return { k, rects, sprites }
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
  it('dibuja el escenario entero y los dos personajes', () => {
    const state = initialState(world, 1)
    const { k, rects, sprites } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    // Rectángulos: sólo las 2 zonas de muerte. La barra de resistencia y el
    // nombre van en el HUD de HTML. Todo lo demás es arte: cielo, dos capas de
    // ciudad, la azotea y un sprite por peleador, de atrás para adelante.
    expect(rects).toHaveLength(2)
    expect(sprites.map((sprite) => sprite.sprite).slice(0, 4)).toEqual([
      SKY.key, ...LAYERS.map((layer) => layer.key), PLATFORM.key,
    ])
    expect(fighters(sprites)).toHaveLength(2)
  })

  it('dibuja las flotantes justo donde la sim dice que se pisa', () => {
    const state = initialState(world, 1)
    const { k, sprites } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    const floats = sprites.filter((sprite) => sprite.sprite === SOFT_PLATFORM.key)
    expect(floats).toHaveLength(SMALL_STAGE.platforms.length)
    for (const [index, sprite] of floats.entries()) {
      const span = platformAt(SMALL_STAGE.platforms[index]!, state.tick)
      // La línea que se pisa en el dibujo es el `top` de la sim.
      expect(sprite.y + SOFT_PLATFORM.surfaceY / SOFT_PLATFORM.textureScale).toBe(toPixels(span.top))
      expect(sprite.x + SOFT_PLATFORM.insetX).toBe(toPixels(span.left))
    }
  })

  it('cada jugador tiene su piel', () => {
    const state = initialState(world, 1)
    const { k, sprites } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    expect(fighters(sprites)[0]?.sprite).toBe(spriteKey('rasta', 'idle'))
    expect(fighters(sprites)[1]?.sprite).toBe(spriteKey('rasta2', 'idle'))
  })

  it('pone a cada personaje parado sobre el piso, mirándose', () => {
    const state = initialState(world, 1)
    const { k, sprites } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    for (const sprite of fighters(sprites)) {
      // El origen medido en la hoja son los pies, que van sobre el piso.
      const feet = feetOf(sprite)
      expect(sprite.scale).toBe(ART_SCALE)
      expect(feet.y).toBe(toPixels(SMALL_STAGE.ground.top))
      expect(feet.x).toBeGreaterThan(toPixels(SMALL_STAGE.ground.left))
      expect(feet.x).toBeLessThan(toPixels(SMALL_STAGE.ground.right))
    }
    // Arrancan mirándose: el de la derecha va espejado.
    expect(fighters(sprites).map((sprite) => sprite.flipX)).toEqual([false, true])
    // Espejar no corre los pies: el origen se mide desde el otro borde.
    for (const [index, sprite] of fighters(sprites).entries()) {
      expect(feetOf(sprite).x).toBe(toPixels(state.fighters[index as 0 | 1].x))
    }
  })

  it('el escenario entra en la pantalla', () => {
    // Un error de escala o de ancla dibujaría todo afuera del canvas, y desde
    // afuera se ve igual que "no dibuja nada".
    const state = initialState(world, 1)
    const { k, sprites } = stubKaplay()

    drawMatch(k, FLAT, state, state, 0)

    const roof = sprites.find((sprite) => sprite.sprite === PLATFORM.key)
    expect(roof?.x).toBeGreaterThanOrEqual(0)
    expect(roof?.x).toBeLessThan(VIEW_W)
    expect(roof?.y).toBeGreaterThan(0)
    expect(roof?.y).toBeLessThan(VIEW_H)
    // Y la cornisa del dibujo es el piso que pisa la sim.
    const surface = (roof?.y ?? 0) + ((roof?.height ?? 0) * PLATFORM.surfaceY) / (PLATFORM.height * PLATFORM.textureScale)
    expect(surface).toBe(toPixels(SMALL_STAGE.ground.top))
  })

  it('el fuerte muestra la pitada mientras carga y el puño recién cuando pega', () => {
    const state = initialState(world, 1)
    const charging = withFighter(state, 0, { state: 'attack', attack: 'nSig', stateFrames: 0 })
    const hitting = withFighter(state, 0, { state: 'attack', attack: 'nSig', stateFrames: OSO.moves.nSig.startup })

    const a = stubKaplay()
    drawMatch(a.k, FLAT, charging, charging, 0)
    const b = stubKaplay()
    drawMatch(b.k, FLAT, hitting, hitting, 0)

    expect(fighters(a.sprites)[0]).toMatchObject({ sprite: spriteKey('rasta', 'heavy'), frame: 0 })
    expect(fighters(b.sprites)[0]).toMatchObject({ sprite: spriteKey('rasta', 'heavy'), frame: 3 })
  })

  it('en el juego la caja del golpe no se ve', () => {
    const state = initialState(world, 1)
    const idle = stubKaplay()
    drawMatch(idle.k, FLAT, state, state, 0)

    const active = withFighter(state, 0, {
      state: 'attack',
      attack: 'nSig',
      stateFrames: OSO.moves.nSig.startup,
    })
    const swinging = stubKaplay()
    drawMatch(swinging.k, FLAT, active, active, 0)

    expect(swinging.rects).toHaveLength(idle.rects.length)
  })

  it('con las cajas prendidas, dibuja la del golpe sólo en los frames activos', () => {
    const state = initialState(world, 1)
    const startup = withFighter(state, 0, { state: 'attack', attack: 'nSig', stateFrames: 0 })
    const active = withFighter(state, 0, {
      state: 'attack',
      attack: 'nSig',
      stateFrames: OSO.moves.nSig.startup,
    })

    const quiet = stubKaplay()
    drawMatch(quiet.k, FLAT, startup, startup, 0, { hitboxes: true })

    const swinging = stubKaplay()
    drawMatch(swinging.k, FLAT, active, active, 0, { hitboxes: true })

    // Es la forma de ver el frame data mientras se ajusta.
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
    const interpolated = fighters(half.sprites)[0]
    expect(interpolated && feetOf(interpolated).x).toBe(toPixels(before.fighters[0].x) + 5)

    // Un salto grande es un respawn: se corta la interpolación para que el
    // muñeco no cruce la pantalla deslizándose desde la zona de muerte.
    const teleported = {
      ...before,
      fighters: [{ ...before.fighters[0], x: before.fighters[0].x + 256 * 400 }, before.fighters[1]] as const,
    }
    const jump = stubKaplay()
    drawMatch(jump.k, FLAT, teleported, before, 0.5)
    const snapped = fighters(jump.sprites)[0]
    expect(snapped && feetOf(snapped).x).toBe(toPixels(teleported.fighters[0].x))
  })
})
