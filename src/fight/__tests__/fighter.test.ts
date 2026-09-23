import { describe, expect, it } from 'vitest'
import { BASE_FIGHTER, jumpAirFrames, jumpApexPx, walkFrames } from '../data/fighter'
import { groundWidthPx, SMALL_STAGE } from '../data/stage'
import { toPixels } from '../sim/fixed'
import { JUMP, LEFT, NONE, RIGHT } from '../sim/input'
import { initialState } from '../sim/state'
import { step, TICKS_PER_SECOND } from '../sim/tick'
import { hold, testWorld, withFighter } from './harness'
import type { Frame } from '../replay/format'

const world = testWorld()

function play(frames: readonly Frame[], from = initialState(world, 1)) {
  let state = from
  for (const frame of frames) state = step(state, frame, world)
  return state
}

describe('movimiento', () => {
  it('caminar acelera hasta la velocidad de caminata y no más', () => {
    const state = play(hold(RIGHT, 60))
    const fighter = state.fighters[0]

    expect(fighter.vx).toBe(BASE_FIGHTER.walkSpeed)
    expect(fighter.state).toBe('walk')
    expect(fighter.facing).toBe(1)
  })

  it('soltar la dirección frena hasta parar', () => {
    const state = play([...hold(RIGHT, 30), ...hold(NONE, 30)])

    expect(state.fighters[0].vx).toBe(0)
    expect(state.fighters[0].state).toBe('idle')
  })

  it('las dos direcciones a la vez es neutro', () => {
    const state = play(hold(LEFT | RIGHT, 30))

    expect(state.fighters[0].vx).toBe(0)
  })

  it('caminar de más por el borde deja al personaje en el aire', () => {
    // No hay paredes: el escenario flota. Caminar de más es caerse. 60 frames
    // alcanzan para pasar el borde y todavía no para salir de la pantalla.
    const state = play(hold(LEFT, 60))

    expect(state.fighters[0].grounded).toBe(false)
    expect(state.fighters[0].state).toBe('air')
  })
})

describe('salto', () => {
  it('sube cerca del apex que dice la fórmula y vuelve al piso', () => {
    const frames = [...hold(JUMP, 2), ...hold(NONE, 60)]
    let state = initialState(world, 1)
    let highest = state.fighters[0].y

    for (const frame of frames) {
      state = step(state, frame, world)
      highest = Math.min(highest, state.fighters[0].y)
    }

    const climbed = toPixels(SMALL_STAGE.ground.top - highest)
    // La integración discreta no da exactamente la fórmula continua: acumula
    // medio frame de gravedad. Un 10% de margen cubre esa diferencia y deja el
    // test sensible a un cambio de verdad en el ajuste.
    expect(climbed).toBeGreaterThan(jumpApexPx() * 0.9)
    expect(climbed).toBeLessThan(jumpApexPx() * 1.1)
    expect(state.fighters[0].grounded).toBe(true)
  })

  it('hay un salto de piso y dos de aire, y ni uno más', () => {
    // Cada salto se pide con un flanco: hay que soltar el botón entre uno y otro.
    const jumpOnce = [...hold(JUMP, 2), ...hold(NONE, 2)]
    const state = play([...jumpOnce, ...jumpOnce, ...jumpOnce, ...jumpOnce])

    expect(state.fighters[0].airJumpsLeft).toBe(0)
    expect(state.fighters[0].grounded).toBe(false)
  })

  it('el salto pedido justo antes de aterrizar no se pierde', () => {
    // Caer desde arriba con el buffer ya cargado: el salto tiene que salir solo
    // al tocar el piso. Sin buffer, el input se comería y se siente como un bug.
    const falling = withFighter(initialState(world, 1), 0, {
      y: SMALL_STAGE.ground.top - 600,
      vy: 0,
      grounded: false,
      state: 'air',
      // Sin saltos de aire: con saltos disponibles el input se gastaría en el
      // acto como salto aéreo, que es lo correcto y no lo que se está probando.
      airJumpsLeft: 0,
      jumpBuffer: BASE_FIGHTER.jumpBufferFrames,
    })

    let state = falling
    let jumped = false
    for (let frame = 0; frame < 10; frame += 1) {
      const previous = state.fighters[0]
      state = step(state, [NONE, NONE], world)
      if (previous.grounded && state.fighters[0].vy < 0) jumped = true
    }

    expect(jumped).toBe(true)
  })

  it('aterriza a la velocidad de caída máxima sin atravesar el piso', () => {
    // El piso se detecta por cruce, no por solapamiento: si se detectara por
    // solapamiento, a esta velocidad el personaje pasaría de largo.
    const falling = withFighter(initialState(world, 1), 0, {
      y: SMALL_STAGE.ground.top - BASE_FIGHTER.maxFall,
      vy: BASE_FIGHTER.maxFall,
      grounded: false,
      state: 'air',
    })

    const state = step(falling, [NONE, NONE], world)

    expect(state.fighters[0].grounded).toBe(true)
    expect(state.fighters[0].y).toBe(SMALL_STAGE.ground.top)
  })
})

describe('ring-out', () => {
  it('caerse gasta una vida y reaparece en el spawn', () => {
    let state = initialState(world, 1)
    const spawn = SMALL_STAGE.spawns[0]

    while (state.fighters[0].stocks === 3 && state.tick < 400) {
      state = step(state, [LEFT, NONE], world)
    }

    expect(state.fighters[0].stocks).toBe(2)
    expect(state.fighters[0].x).toBe(spawn.x)
    expect(state.fighters[0].invuln).toBeGreaterThan(0)
  })

  it('agotar las vidas termina el match y el otro gana', () => {
    const state = play(hold(LEFT, 600))

    expect(state.over).toBe(true)
    expect(state.winner).toBe(1)
    expect(state.fighters[0].state).toBe('dead')
    expect(state.fighters[1].stocks).toBe(3)
  })

  it('terminado el match el estado queda congelado', () => {
    const finished = play(hold(LEFT, 600))
    const after = step(finished, [RIGHT, RIGHT], world)

    expect(after.tick).toBe(finished.tick + 1)
    expect(after.fighters).toEqual(finished.fighters)
  })
})

/**
 * Invariantes de jugabilidad, al estilo de `jumpWindow` en MrDrop Run: no
 * verifican un número, verifican que el juego se pueda jugar. Son las que avisan
 * cuando un ajuste "chiquito" rompe algo que nadie estaba mirando.
 */
describe('el ajuste deja un juego jugable', () => {
  it('se puede volver al escenario después de que te saquen', () => {
    /**
     * La invariante más importante de un juego de ring-out, y se pelea de
     * verdad: al personaje lo dejamos al borde de la zona de muerte, en el aire,
     * y desde ahí tiene que volver gastando la cadena de saltos. Si no llega,
     * cualquier golpe en el borde es un KO garantizado y la pelea es una ruleta.
     *
     * Con la sim y no con una fórmula: la fórmula ignora la deriva durante la
     * caída, que es la mitad de la recuperación, y lo que hay que garantizar es
     * que se pueda jugando, no en el papel.
     */
    const atTheEdge = withFighter(initialState(world, 1), 0, {
      x: SMALL_STAGE.blastLeft + 256,
      y: SMALL_STAGE.ground.top,
      vx: 0,
      vy: 0,
      grounded: false,
      state: 'air',
    })

    /**
     * Derecha apretada y un salto cada 20 frames, que es dejar que cada salto
     * termine antes de gastar el siguiente. Espaciarlos es parte de la
     * habilidad: con un flanco cada 4 frames se gastan los dos saltos de aire en
     * los primeros 8 y desde ahí ya se cae por debajo del escenario sin remedio.
     */
    let state = atTheEdge
    let recovered = false

    for (let frame = 0; frame < 180; frame += 1) {
      state = step(state, [frame % 20 === 0 ? RIGHT | JUMP : RIGHT, NONE], world)
      const fighter = state.fighters[0]
      // El orden importa: al reaparecer también está en el piso, y eso no es
      // haber vuelto.
      if (fighter.stocks < 3) break
      if (fighter.grounded) {
        recovered = true
        break
      }
    }

    expect(recovered).toBe(true)
    expect(state.fighters[0].stocks).toBe(3)
    expect(state.fighters[0].x).toBeGreaterThanOrEqual(
      SMALL_STAGE.ground.left - BASE_FIGHTER.halfWidth,
    )
  })

  it('el escenario se cruza caminando en un tiempo razonable', () => {
    const seconds = walkFrames(groundWidthPx(SMALL_STAGE)) / TICKS_PER_SECOND

    // Menos de segundo y medio es un escenario de bolsillo donde no se puede
    // huir; más de tres y medio, uno donde nunca te alcanzan.
    expect(seconds).toBeGreaterThan(1.5)
    expect(seconds).toBeLessThan(3.5)
  })

  it('el primer salto vale más que los de aire', () => {
    expect(jumpAirFrames(BASE_FIGHTER.airJumpVelocity)).toBeLessThan(
      jumpAirFrames(BASE_FIGHTER.jumpVelocity),
    )
  })

  it('el salto sube más que el alto del personaje pero no una pantalla entera', () => {
    const height = toPixels(BASE_FIGHTER.height)

    expect(jumpApexPx()).toBeGreaterThan(height * 1.5)
    expect(jumpApexPx()).toBeLessThan(height * 3)
  })
})
