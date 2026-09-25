import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { followsUp, frameAdvantage, inputOf, pressFor } from '../data/combos'
import { MOVE_KEYS } from '../sim/attack'
import { DOWN, HEAVY, LEFT, LIGHT, RIGHT } from '../sim/input'
import { moveFor } from '../sim/moves'
import type { World } from '../sim/world'
import { testWorld } from './harness'

/**
 * Las invariantes de combo. El test no verifica un número: verifica que el
 * juego tenga la forma que queremos — que los combos se corten solos con mucho
 * daño y que ningún golpe se encadene consigo mismo para siempre.
 *
 * Las medidas salen de `data/combos.ts`, que juega la sim de verdad.
 */

const world = testWorld()

/** Un mundo de prueba donde el rápido deja al rival quieto y aturdido: ahí sí o sí hay combo. */
function stickyWorld(): World {
  const sticky = { ...OSO.moves.nLight, hitstun: 60, knockback: { x: 0, y: 0 } }
  const tuning = { ...OSO, moves: { ...OSO.moves, nLight: sticky, sLight: sticky } }
  return { ...world, tuning: [tuning, tuning] }
}

describe('la herramienta de medición', () => {
  it('sabe apretar cada golpe: el input que arma da ese mismo golpe', () => {
    for (const key of MOVE_KEYS) {
      const { aerial, button, aim } = inputOf(key)
      expect(moveFor(!aerial, button, aim)).toBe(key)
    }
    expect(pressFor('sLight', -1)).toBe(LIGHT | LEFT)
    expect(pressFor('sSig', 1)).toBe(HEAVY | RIGHT)
    expect(pressFor('dAir', 1)).toBe(LIGHT | DOWN)
  })

  it('cada golpe pega desde la posición de medida', () => {
    for (const key of MOVE_KEYS) expect(frameAdvantage(world, key, 0)).not.toBeNull()
  })

  it('encuentra el combo cuando lo hay (control positivo)', () => {
    const sticky = stickyWorld()
    expect(frameAdvantage(sticky, 'nLight', 0)!.advantage).toBeGreaterThan(20)
    expect(followsUp(sticky, 'nLight', 'nLight', 0).real).toBe(true)
    // Y con salto también: el aéreo sale después de despegar.
    expect(followsUp(sticky, 'nLight', 'nAir', 0).real).toBe(true)
  })

  it('más daño, más ventaja y más distancia: el empuje escala', () => {
    const low = frameAdvantage(world, 'nSig', 0)!
    const high = frameAdvantage(world, 'nSig', 100)!
    expect(high.gapPx).toBeGreaterThan(low.gapPx)
  })
})

describe('los combos', () => {
  it('a 100 de daño ninguna ruta de dos golpes es real: los combos meten daño, no matan', () => {
    const real = MOVE_KEYS.flatMap((first) =>
      MOVE_KEYS.filter((second) => followsUp(world, first, second, 100).real).map((second) => `${first} → ${second}`),
    )
    expect(real).toEqual([])
  })

  it('ningún golpe se sigue a sí mismo, con ningún daño: no hay loops infinitos', () => {
    const loops: string[] = []
    for (const key of MOVE_KEYS) {
      for (const damage of [0, 25, 50, 75, 100, 150]) {
        if (followsUp(world, key, key, damage).real) loops.push(`${key} a ${damage}`)
      }
    }
    expect(loops).toEqual([])
  })

  // Llega en F3, cuando los golpes de piso tengan datos propios (docs/pelea/tareas.md).
  it.todo('existe una ruta real a daño bajo (dLight → sAir entre 0 y 40)')
})
