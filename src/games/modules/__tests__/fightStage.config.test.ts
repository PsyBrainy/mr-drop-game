import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { project, targetCamera, type Camera } from '../../../fight/camera'
import { OSO } from '../../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../../fight/data/stage'
import { fx, toPixels } from '../../../fight/sim/fixed'
import { initialState, type MatchState } from '../../../fight/sim/state'
import { DEFAULT_RULES, type World } from '../../../fight/sim/world'
import { LAYERS, layerCamera, PARALLAX_ANCHOR, PLATFORM, SKY, SOFT_PLATFORM, STAGE_SPRITES } from '../fightStage.config'
import { VIEW } from '../fightView'

/**
 * El fondo no decide nada, pero puede mentir de dos formas: una cornisa que no
 * coincide con el piso de la sim (los personajes flotan o se hunden), y una
 * capa que no llega a cubrir la pantalla con algún encuadre (se ve el vacío).
 * Las dos se prueban con la cámara de verdad, no con una cuenta aparte.
 */

const world: World = { stage: SMALL_STAGE, tuning: [OSO, OSO], rules: DEFAULT_RULES }
const ground = SMALL_STAGE.ground

function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(`public${path}`)
  expect(buffer.subarray(1, 4).toString()).toBe('PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('la azotea coincide con el piso de la sim', () => {
  it('la cornisa cae justo sobre el piso', () => {
    expect(PLATFORM.y + PLATFORM.surfaceY / PLATFORM.textureScale).toBe(toPixels(ground.top))
  })

  it('los caños de los costados son las paredes de las que uno se cuelga', () => {
    expect(PLATFORM.x + PLATFORM.wallLeftX / PLATFORM.textureScale).toBe(toPixels(ground.left))
    expect(PLATFORM.x + PLATFORM.wallRightX / PLATFORM.textureScale).toBe(toPixels(ground.right))
  })

  it('el dibujo cubre todo el bloque, hasta abajo', () => {
    expect(PLATFORM.x).toBeLessThanOrEqual(toPixels(ground.left))
    expect(PLATFORM.x + PLATFORM.width).toBeGreaterThanOrEqual(toPixels(ground.right))
    expect(PLATFORM.y + PLATFORM.height).toBeGreaterThanOrEqual(toPixels(ground.bottom))
  })
})

describe('las flotantes coinciden con las de la sim', () => {
  it('el dibujo cubre el piso entero de cada flotante, con los soportes a los costados', () => {
    for (const platform of SMALL_STAGE.platforms) {
      expect(SOFT_PLATFORM.width).toBe(toPixels(platform.width) + SOFT_PLATFORM.insetX * 2)
    }
  })

  it('la textura mide lo que dice el config, a 2x', () => {
    expect(pngSize(SOFT_PLATFORM.src)).toEqual({
      width: SOFT_PLATFORM.width * SOFT_PLATFORM.textureScale,
      height: SOFT_PLATFORM.height * SOFT_PLATFORM.textureScale,
    })
  })
})

describe('el fondo tapa la pantalla con cualquier encuadre', () => {
  /**
   * Encuadres extremos sacados de la cámara real: los dos en una punta, los dos
   * arriba de todo, uno en cada zona de muerte. Así el test sigue siendo cierto
   * si alguien cambia el zoom o el clamp de la cámara.
   */
  const spots = [-40, 100, 200, 480, 760, 900, 1000]
  const heights = [-380, -100, 200, 420, 560, 780]
  const cameras: Camera[] = []
  const base = initialState(world, 1)
  for (const x0 of spots) {
    for (const x1 of spots) {
      for (const y of heights) {
        const state: MatchState = {
          ...base,
          fighters: [
            { ...base.fighters[0], x: fx(x0), y: fx(y) },
            { ...base.fighters[1], x: fx(x1), y: fx(420) },
          ],
        }
        cameras.push(targetCamera(state, world, VIEW))
      }
    }
  }

  it.each(LAYERS.map((layer) => [layer.key, layer] as const))('%s llega de borde a borde', (_, layer) => {
    for (const camera of cameras) {
      const lens = layerCamera(camera, layer.parallax)
      const left = project(lens, VIEW, layer.x, layer.y).x
      const right = project(lens, VIEW, layer.x + layer.width, layer.y).x
      expect(left).toBeLessThanOrEqual(0)
      expect(right).toBeGreaterThanOrEqual(VIEW.width)
    }
  })

  it('con la cámara en el encuadre de arranque, las capas se ven como se dibujaron', () => {
    const lens = layerCamera({ ...PARALLAX_ANCHOR, scale: 1 }, 0.5)
    expect(lens).toEqual({ ...PARALLAX_ANCHOR, scale: 1 })
  })
})

describe('las texturas del escenario', () => {
  it('el cielo mide lo mismo que la pantalla', () => {
    expect(pngSize(SKY.src)).toEqual({ width: VIEW.width, height: VIEW.height })
  })

  it.each(LAYERS.map((layer) => [layer.src, layer] as const))('%s mide lo que dice el config', (_, layer) => {
    expect(pngSize(layer.src)).toEqual({ width: layer.width, height: layer.height })
  })

  it('la azotea mide lo que dice el config, a 2x', () => {
    expect(pngSize(PLATFORM.src)).toEqual({
      width: PLATFORM.width * PLATFORM.textureScale,
      height: PLATFORM.height * PLATFORM.textureScale,
    })
  })

  it('todo entra en una GPU de celular y no se come la VRAM', () => {
    let bytes = 0
    for (const sprite of STAGE_SPRITES) {
      const { width, height } = pngSize(sprite.src)
      expect(Math.max(width, height)).toBeLessThanOrEqual(2048)
      bytes += width * height * 4
    }
    expect(bytes / 1024 / 1024).toBeLessThan(12)
  })
})
