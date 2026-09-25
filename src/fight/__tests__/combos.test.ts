import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { followsUp, frameAdvantage, inputOf, pressFor } from '../data/combos'
import { MOVE_KEYS } from '../sim/attack'
import { fxRatio } from '../sim/fixed'
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

  it('encuentra el combo con gravity cancel cuando lo hay (control positivo)', () => {
    // Los dos en el aire, cayendo muy despacio (gravedad 0,1): el primer aéreo
    // aturde 50 frames sin empujar y nadie llega al piso antes de que termine.
    // Un golpe de piso sólo puede salir con gravity cancel, y la herramienta lo
    // tiene que ver.
    const sticky = { ...OSO.moves.nAir, hitstun: 50, knockback: { x: 0, y: 0 } }
    const tuning = { ...OSO, gravity: fxRatio(1, 10), moves: { ...OSO.moves, nAir: sticky } }
    const floaty: World = { ...world, tuning: [tuning, tuning] }
    const route = followsUp(floaty, 'nAir', 'sLight', 0)
    expect(route.real).toBe(true)
    expect(route.gravityCancel).toBe(true)
  })

  it('más daño, más ventaja y más distancia: el empuje escala', () => {
    const low = frameAdvantage(world, 'nSig', 0)!
    const high = frameAdvantage(world, 'nSig', 100)!
    expect(high.gapPx).toBeGreaterThan(low.gapPx)
  })
})

describe('los combos', () => {
  // Las dos que siguen incluyen rutas con gravity cancel: `followsUp` las prueba
  // cuando el segundo golpe es de piso.
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

  it.each([0, 20, 40])('la barrida levanta y el aéreo la agarra: dLight → sAir es combo a %i de daño', (damage) => {
    const route = followsUp(world, 'dLight', 'sAir', damage)
    expect(route.real).toBe(true)
    // Se hace saltando: el aéreo no sale del piso.
    expect(route.jumpAt).not.toBeNull()
  })

  it('a 0 de daño la barrida deja al rival fuera del alcance de los golpes de piso', () => {
    // Si un golpe de piso también entrara, la ruta sería "barrida y lo que sea",
    // no "barrida y salto": el salto es la parte que se aprende.
    const ground = ['nLight', 'sLight', 'dLight', 'nSig', 'sSig', 'dSig'] as const
    expect(ground.filter((key) => followsUp(world, 'dLight', key, 0).real)).toEqual([])
  })
})
