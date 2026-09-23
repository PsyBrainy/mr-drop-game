import { describe, expect, it } from 'vitest'
import { OSO } from '../../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../../fight/data/stage'
import { toPixels } from '../../../fight/sim/fixed'
import { initialState } from '../../../fight/sim/state'
import { DEFAULT_RULES, type World } from '../../../fight/sim/world'
import { shortName } from '../../../infrastructure/ws/fightNames'
import { CRITICAL, heartsOf, panelOf, resistanceHue } from '../fightHud'
import { tagAnchors } from '../fightView'

/**
 * El HUD de la pelea es DOM y no se puede montar en Vitest (corre en Node), así
 * que se prueba lo que decide qué mostrar: los colores, los corazones, lo que se
 * lee del estado y dónde va el nombre. El DOM es sólo dónde se escribe.
 */

const world: World = { stage: SMALL_STAGE, tuning: [OSO, OSO], rules: DEFAULT_RULES }

describe('la barra de resistencia', () => {
  it('va de verde lleno a rojo vacío', () => {
    expect(resistanceHue(1)).toBe(130)
    expect(resistanceHue(0)).toBe(0)
  })

  it('cambia de color de a poco, siempre hacia el rojo', () => {
    for (let r = 0.05; r <= 1; r += 0.05) {
      expect(resistanceHue(r)).toBeGreaterThanOrEqual(resistanceHue(r - 0.05))
    }
  })

  it('en la zona crítica ya es naranja o rojo', () => {
    // Por debajo de 40 de tono ya no se lee como amarillo.
    expect(resistanceHue(CRITICAL)).toBeLessThan(40)
  })

  it('no se sale de la escala con valores raros', () => {
    expect(resistanceHue(-1)).toBe(0)
    expect(resistanceHue(3)).toBe(130)
  })
})

describe('las vidas', () => {
  it('son corazones: los que quedan llenos y los perdidos vacíos', () => {
    expect(heartsOf(2, 3)).toEqual([true, true, false])
    expect(heartsOf(0, 3)).toEqual([false, false, false])
  })

  it('el panel se lee del estado, sin guardar nada aparte', () => {
    const state = initialState(world, 1)
    const hit = { ...state.fighters[0], damage: 30 }
    expect(panelOf(hit, DEFAULT_RULES)).toEqual({
      stocks: DEFAULT_RULES.stocks,
      maxStocks: DEFAULT_RULES.stocks,
      resistance: (DEFAULT_RULES.maxResistance - 30) / DEFAULT_RULES.maxResistance,
      resistanceValue: DEFAULT_RULES.maxResistance - 30,
    })
  })

  it('el que quedó afuera muestra todos los corazones vacíos', () => {
    const state = initialState(world, 1)
    const dead = { ...state.fighters[0], state: 'dead' as const, stocks: 1 }
    expect(panelOf(dead, DEFAULT_RULES).stocks).toBe(0)
  })
})

describe('el nombre sobre la cabeza', () => {
  const FLAT = { x: 480, y: 270, scale: 1 }

  it('va arriba de cada personaje y sigue su x', () => {
    const state = initialState(world, 1)
    const [a, b] = tagAnchors(FLAT, state, state, 0)
    for (const [index, anchor] of [a, b].entries()) {
      const fighter = state.fighters[index as 0 | 1]
      expect(anchor?.x).toBe(toPixels(fighter.x))
      // Arriba del cuerpo entero, no encima de la cara.
      expect(anchor?.y).toBeLessThan(toPixels(fighter.y - OSO.height))
    }
  })

  it('no aparece el de alguien que ya quedó afuera', () => {
    const state = initialState(world, 1)
    const out = { ...state, fighters: [{ ...state.fighters[0], state: 'dead' as const }, state.fighters[1]] as const }
    expect(tagAnchors(FLAT, out, out, 0)[0]).toBeNull()
  })

  it('un nombre largo se corta para no tapar el escenario', () => {
    expect(shortName('Pepe')).toBe('Pepe')
    expect(shortName('UnNombreDeUsuarioLarguísimo')).toHaveLength(16)
    expect(shortName('UnNombreDeUsuarioLarguísimo').endsWith('…')).toBe(true)
  })
})
