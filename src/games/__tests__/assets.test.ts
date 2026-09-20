import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COGOLLO_SPIN,
  COGOLLO_TAKEN,
  COP_CRASH,
  COP_DRIVE,
  PUNTOS,
  POZO_BREAK,
  POZO_LAVA,
  LAYER_H,
  LAYER_W,
  LAYERS,
  TRUCK_JUMP,
  TRUCK_RUN,
  type Sheet,
} from '../modules/mrdropRun.config'

/**
 * El límite de textura de una GPU de celular es 4096 px en equipos modernos y
 * 2048 en los viejos. Una textura que no entra simplemente no se sube y el
 * juego se ve todo negro — pasó con el arte original, que llegaba a 5880 px.
 * La VRAM total también importa: 119 MB de texturas tiraban la pestaña.
 */
const MAX_TEXTURE_SIDE = 2048
const MAX_TOTAL_VRAM_MB = 40

function pngSize(publicPath: string): { width: number; height: number } {
  const buffer = readFileSync(`public${publicPath}`)
  expect(buffer.subarray(1, 4).toString()).toBe('PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const sheets: Sheet[] = [TRUCK_RUN, TRUCK_JUMP, COP_DRIVE, COP_CRASH, COGOLLO_SPIN, COGOLLO_TAKEN, POZO_BREAK, POZO_LAVA, PUNTOS]
const everySource = [...sheets.map((s) => s.src), ...LAYERS.map((l) => l.src)]

describe('texturas', () => {
  it.each(everySource)('%s entra en una GPU de celular', (src) => {
    const { width, height } = pngSize(src)
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_TEXTURE_SIDE)
  })

  it('el total de VRAM es razonable para un teléfono', () => {
    const bytes = everySource.reduce((total, src) => {
      const { width, height } = pngSize(src)
      return total + width * height * 4
    }, 0)
    expect(bytes / 1024 / 1024).toBeLessThan(MAX_TOTAL_VRAM_MB)
  })
})

describe('sprite sheets', () => {
  it.each(sheets)('$key se corta en frames exactos', (sheet) => {
    // Algunas hojas son una grilla de varias filas, así que el corte se mide
    // por columnas y filas, no por la cantidad total de frames.
    const { width, height } = pngSize(sheet.src)
    expect(sheet.cols * sheet.rows).toBe(sheet.frames)
    expect(sheet.frameWidth * sheet.cols).toBe(width)
    expect(sheet.frameHeight * sheet.rows).toBe(height)
  })

  it.each(sheets)('$key tiene el contenido medido dentro del frame', (sheet) => {
    expect(sheet.left + sheet.contentWidth).toBeLessThanOrEqual(sheet.frameWidth)
    expect(sheet.bottom).toBeLessThanOrEqual(sheet.frameHeight)
  })
})

describe('capas de fondo', () => {
  it.each(LAYERS.map((l) => l.src))('%s coincide con las medidas del config', (src) => {
    const { width, height } = pngSize(src)
    expect(width).toBe(LAYER_W)
    expect(height).toBe(LAYER_H)
  })
})
