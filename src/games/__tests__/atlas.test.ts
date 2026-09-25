import { describe, expect, it } from 'vitest'
import { atlasUse, worstAtlasUse } from '../kaplay/atlas'

/**
 * El empaquetado del atlas de Kaplay, repetido a mano. Estos casos fijan el
 * comportamiento del estante: si una actualización de Kaplay lo cambia, esto no
 * se entera, pero cualquiera que lea este archivo sabe qué se asumió.
 */
describe('el atlas', () => {
  it('una sola imagen chica ya paga una página entera', () => {
    expect(atlasUse([{ width: 10, height: 10 }])).toEqual({ pages: 1, loose: 0, megabytes: 16 })
  })

  it('llena el estante de izquierda a derecha y baja cuando no entra', () => {
    const half = { width: 1024, height: 1024 }
    expect(atlasUse([half, half, half, half]).pages).toBe(1)
    expect(atlasUse([half, half, half, half, half]).pages).toBe(2)
  })

  it('el estante mide lo que la imagen más alta: una alta y muchas bajas desperdician', () => {
    const tall = { width: 100, height: 1100 }
    const flat = { width: 2048, height: 100 }
    // El primer estante queda de 1100 de alto por la alta; la plana no entra al
    // lado, baja a y=1100, y la segunda plana ya no entra en la página.
    expect(atlasUse([tall, flat, flat]).pages).toBe(1)
    expect(atlasUse([tall, flat, { width: 2048, height: 900 }]).pages).toBe(2)
  })

  it('lo que no entra en una página va suelto, con su tamaño', () => {
    const use = atlasUse([{ width: 4096, height: 1024 }])
    expect(use.loose).toBe(1)
    expect(use.megabytes).toBe(16 + 16)
  })

  it('el peor orden nunca es mejor que el orden pedido', () => {
    const images = [
      { width: 1500, height: 600 },
      { width: 600, height: 100 },
      { width: 1500, height: 600 },
      { width: 600, height: 1400 },
    ]
    expect(worstAtlasUse(images).megabytes).toBeGreaterThanOrEqual(atlasUse(images).megabytes)
  })
})
