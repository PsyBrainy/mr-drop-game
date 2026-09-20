import { describe, expect, it } from 'vitest'
import { fitInside } from '../lib/layout'

const AR = 960 / 540

describe('fitInside', () => {
  it('nunca se pasa de la caja, en ninguna forma de pantalla', () => {
    const cajas = [
      { width: 390, height: 844 },   // teléfono vertical
      { width: 844, height: 390 },   // teléfono apaisado
      { width: 932, height: 430 },   // iPhone apaisado con muesca
      { width: 1920, height: 1080 }, // escritorio
      { width: 300, height: 300 },   // cuadrada
    ]
    for (const caja of cajas) {
      const fit = fitInside(AR, caja)
      expect(fit.width).toBeLessThanOrEqual(caja.width + 0.001)
      expect(fit.height).toBeLessThanOrEqual(caja.height + 0.001)
    }
  })

  it('mantiene la relación de aspecto', () => {
    for (const caja of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const fit = fitInside(AR, caja)
      expect(fit.width / fit.height).toBeCloseTo(AR, 6)
    }
  })

  it('toca uno de los dos bordes: no deja aire de más', () => {
    const caja = { width: 844, height: 390 }
    const fit = fitInside(AR, caja)
    const tocaAncho = Math.abs(fit.width - caja.width) < 0.001
    const tocaAlto = Math.abs(fit.height - caja.height) < 0.001
    expect(tocaAncho || tocaAlto).toBe(true)
  })

  it('aguanta medidas degeneradas sin romper', () => {
    expect(fitInside(AR, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 })
    expect(fitInside(0, { width: 100, height: 100 })).toEqual({ width: 0, height: 0 })
  })
})
