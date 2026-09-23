import { describe, expect, it } from 'vitest'
import { OSO } from '../data/characters/oso'
import { SMALL_STAGE } from '../data/stage'
import { isActive, totalFrames, type MoveKey } from '../sim/attack'
import { toPixels } from '../sim/fixed'
import { DODGE, HEAVY, JUMP, LEFT, LIGHT, NONE, type Input } from '../sim/input'
import { isInvulnerable } from '../sim/resolve'
import { initialState, type MatchState } from '../sim/state'
import { step } from '../sim/tick'
import { testWorld, withFighter } from './harness'

const world = testWorld()

/** Los dos pegados en el centro, el 0 mirando al 1. */
function facingOff(patch: { damage?: number; gap?: number } = {}): MatchState {
  const gap = patch.gap ?? OSO.halfWidth * 2 + 256 * 10
  let state = initialState(world, 1)
  state = withFighter(state, 0, { x: SMALL_STAGE.spawns[0].x, facing: 1 })
  state = withFighter(state, 1, {
    x: SMALL_STAGE.spawns[0].x + gap,
    facing: -1,
    damage: patch.damage ?? 0,
  })
  return state
}

/** Aprieta el botón dos frames (hace falta un flanco) y después suelta. */
function swing(button: Input, frames: number, state: MatchState, other: Input = NONE): MatchState {
  let current = state
  for (let frame = 0; frame < frames; frame += 1) {
    current = step(current, [frame < 2 ? button : NONE, frame < 2 ? other : NONE], world)
  }
  return current
}

describe('frame data', () => {
  const moves: MoveKey[] = ['lightGround', 'lightAir', 'heavy']

  it.each(moves)('%s tiene las tres fases y pega en las activas', (key) => {
    const move = OSO.moves[key]

    expect(move.startup).toBeGreaterThan(0)
    expect(move.active).toBeGreaterThan(0)
    expect(move.recovery).toBeGreaterThan(0)
    expect(isActive(move, move.startup - 1)).toBe(false)
    expect(isActive(move, move.startup)).toBe(true)
    expect(isActive(move, move.startup + move.active)).toBe(false)
  })

  it.each(moves)('%s llega más lejos que el propio cuerpo', (key) => {
    // Una caja que no sale del cuerpo obligaría a superponerse con el rival para
    // pegar, y no habría distancia que jugar.
    const move = OSO.moves[key]
    const reach = move.hitbox.dx + Math.trunc(move.hitbox.width / 2)
    expect(reach).toBeGreaterThan(OSO.halfWidth)
  })

  it('el fuerte es más lento, pega más y se castiga más que los livianos', () => {
    const { heavy, lightGround } = OSO.moves

    expect(heavy.startup).toBeGreaterThan(lightGround.startup)
    expect(heavy.recovery).toBeGreaterThan(lightGround.recovery)
    expect(heavy.damage).toBeGreaterThan(lightGround.damage)
    expect(heavy.priority).toBeGreaterThan(lightGround.priority)
  })

  it('el esquive deja de cubrir antes de terminar', () => {
    // Si la invulnerabilidad durara todo el esquive, esquivar sería gratis y no
    // habría nada que arriesgar.
    expect(OSO.dodge.invulnTo).toBeLessThan(OSO.dodge.frames)
    expect(OSO.dodge.invulnFrom).toBeGreaterThan(0)
  })
})

describe('un golpe', () => {
  it('conecta recién en los frames activos, no al apretar', () => {
    const start = facingOff()
    const startup = OSO.moves.lightGround.startup

    const justBefore = swing(LIGHT, startup, start)
    expect(justBefore.fighters[1].damage).toBe(0)

    const connected = swing(LIGHT, startup + 1, start)
    expect(connected.fighters[1].damage).toBe(OSO.moves.lightGround.damage)
  })

  it('deja al rival sin control y lo despega del piso', () => {
    const hit = swing(LIGHT, 8, facingOff())
    const victim = hit.fighters[1]

    expect(victim.state).toBe('hitstun')
    expect(victim.hitstun).toBeGreaterThan(0)
    expect(victim.grounded).toBe(false)
    expect(victim.vx).toBeGreaterThan(0)
  })

  it('pega una sola vez aunque la caja quede activa varios frames', () => {
    // La caja del liviano vive 3 frames: sin el hitId pegaría tres veces.
    const hit = swing(LIGHT, 12, facingOff())

    expect(hit.fighters[1].damage).toBe(OSO.moves.lightGround.damage)
  })

  it('no toca a quien acaba de reaparecer', () => {
    const invulnerable = withFighter(facingOff(), 1, { invuln: 60 })
    const hit = swing(LIGHT, 12, invulnerable)

    expect(hit.fighters[1].damage).toBe(0)
  })

  it('empuja más cuanto más daño tiene el que lo recibe', () => {
    const fresh = swing(HEAVY, 16, facingOff({ damage: 0 }))
    const battered = swing(HEAVY, 16, facingOff({ damage: 100 }))

    expect(battered.fighters[1].vx).toBeGreaterThan(fresh.fighters[1].vx * 2)
  })
})

describe('cuando los dos pegan en el mismo frame', () => {
  it('con la misma prioridad se anulan: nadie cobra', () => {
    const clash = swing(LIGHT, 8, facingOff(), LIGHT)

    expect(clash.fighters[0].damage).toBe(0)
    expect(clash.fighters[1].damage).toBe(0)
    expect(clash.fighters[0].attack).toBeNull()
    expect(clash.fighters[1].attack).toBeNull()
  })

  it('el fuerte atraviesa al liviano', () => {
    // El fuerte sale en 12 y el liviano en 4, así que para que las cajas se
    // crucen el liviano tiene que salir más tarde. Se aprieta desfasado.
    let state = facingOff()
    for (let frame = 0; frame < 20; frame += 1) {
      const p0: Input = frame < 2 ? HEAVY : NONE
      const p1: Input = frame >= 8 && frame < 10 ? LIGHT : NONE
      state = step(state, [p0, p1], world)
    }

    expect(state.fighters[1].damage).toBe(OSO.moves.heavy.damage)
    expect(state.fighters[0].damage).toBe(0)
  })
})

describe('el esquive', () => {
  it('cubre en su ventana y deja de cubrir al final', () => {
    const state = initialState(world, 1)
    const dodging = withFighter(state, 0, { state: 'dodge', stateFrames: OSO.dodge.invulnFrom })
    const late = withFighter(state, 0, { state: 'dodge', stateFrames: OSO.dodge.invulnTo + 1 })

    expect(isInvulnerable(dodging.fighters[0], OSO)).toBe(true)
    expect(isInvulnerable(late.fighters[0], OSO)).toBe(false)
  })

  it('esquivar a tiempo evita el golpe', () => {
    let state = facingOff()
    for (let frame = 0; frame < 12; frame += 1) {
      const p0: Input = frame < 2 ? LIGHT : NONE
      // El esquive arranca un frame después: la invulnerabilidad empieza a los 3.
      const p1: Input = frame >= 1 && frame < 3 ? DODGE : NONE
      state = step(state, [p0, p1], world)
    }

    expect(state.fighters[1].damage).toBe(0)
  })

  it('en el aire cuesta un salto, así que no se puede flotar esquivando', () => {
    const airborne = withFighter(initialState(world, 1), 0, {
      y: SMALL_STAGE.ground.top - 256 * 200,
      grounded: false,
      state: 'air',
    })

    const dodged = step(airborne, [DODGE, NONE], world)

    expect(dodged.fighters[0].state).toBe('dodge')
    expect(dodged.fighters[0].airJumpsLeft).toBe(OSO.airJumps - 1)
  })
})

describe('aterrizar en medio de un aéreo', () => {
  it('deja sin control los frames de aterrizaje', () => {
    // Tirar un aéreo tan bajo que no termine antes de tocar el piso es el error
    // que castiga el landLag.
    const low = withFighter(initialState(world, 1), 0, {
      y: SMALL_STAGE.ground.top - 256 * 8,
      vy: 0,
      grounded: false,
      state: 'air',
    })

    let state = step(low, [LIGHT, NONE], world)
    expect(state.fighters[0].state).toBe('attack')

    while (!state.fighters[0].grounded) state = step(state, [NONE, NONE], world)

    expect(state.fighters[0].landLag).toBeGreaterThan(0)
    expect(state.fighters[0].attack).toBeNull()
  })
})

/**
 * Las invariantes del reparto de roles: los livianos acumulan daño y el fuerte
 * es el que mata. Si alguien toca un knockback y esto se rompe, el juego cambia
 * de género sin que nadie lo haya decidido.
 */
describe('el daño acumulado es lo que mata', () => {
  const untilSettled = (state: MatchState): MatchState => {
    let current = state
    for (let frame = 0; frame < 300; frame += 1) {
      current = step(current, [NONE, NONE], world)
      if (current.fighters[1].stocks < 3) return current
      if (current.fighters[1].grounded && current.fighters[1].hitstun === 0 && frame > 40) break
    }
    return current
  }

  it('un fuerte a 0 de daño no mata desde el centro', () => {
    const hit = untilSettled(swing(HEAVY, 20, facingOff({ damage: 0 })))

    expect(hit.fighters[1].stocks).toBe(3)
    expect(hit.fighters[1].grounded).toBe(true)
  })

  it('el mismo fuerte a 120 de daño sí mata', () => {
    const hit = untilSettled(swing(HEAVY, 20, facingOff({ damage: 120 })))

    expect(hit.fighters[1].stocks).toBe(2)
  })

  it('un liviano no mata desde el centro ni con daño altísimo', () => {
    const hit = untilSettled(swing(LIGHT, 20, facingOff({ damage: 200 })))

    expect(hit.fighters[1].stocks).toBe(3)
    expect(toPixels(hit.fighters[1].x)).toBeLessThan(toPixels(SMALL_STAGE.ground.right))
  })

  it('el golpe más largo del personaje no dura medio segundo', () => {
    // Un ataque que dure más que eso se ve venir desde la otra punta y no lo
    // usaría nadie.
    for (const key of ['lightGround', 'lightAir', 'heavy'] as MoveKey[]) {
      expect(totalFrames(OSO.moves[key])).toBeLessThan(40)
    }
  })
})

/**
 * La pared del borde: lo que convierte quedar afuera en algo que se pelea.
 */
describe('agarrarse del borde', () => {
  /** En el aire, a la altura del canto, a la izquierda de la plataforma. */
  const besideTheWall = (patch: Partial<{ vx: number; clingLeft: number; hitstun: number }> = {}) =>
    withFighter(initialState(world, 1), 0, {
      x: SMALL_STAGE.ground.left - OSO.halfWidth - 256 * 4,
      y: SMALL_STAGE.ground.top + 256 * 30,
      vx: patch.vx ?? OSO.airSpeed,
      vy: 0,
      grounded: false,
      state: patch.hitstun ? 'hitstun' : 'air',
      clingLeft: patch.clingLeft ?? OSO.wall.clingFrames,
      hitstun: patch.hitstun ?? 0,
    })

  it('se prende al empujar contra el costado', () => {
    const clinging = step(besideTheWall(), [NONE, NONE], world)
    const fighter = clinging.fighters[0]

    expect(fighter.state).toBe('cling')
    expect(fighter.vx).toBe(0)
    // Mira para afuera: es de ahí de donde va a saltar.
    expect(fighter.facing).toBe(-1)
  })

  it('resbala despacio en vez de caer', () => {
    let state = step(besideTheWall(), [NONE, NONE], world)
    const startY = state.fighters[0].y

    for (let frame = 0; frame < 10; frame += 1) state = step(state, [NONE, NONE], world)

    const fallen = state.fighters[0].y - startY
    expect(state.fighters[0].state).toBe('cling')
    // Resbala, pero mucho menos de lo que caería en caída libre.
    expect(fallen).toBe(OSO.wall.slide * 10)
    expect(fallen).toBeLessThan(OSO.maxFall * 10)
  })

  it('el salto de pared no gasta saltos de aire', () => {
    let state = step(besideTheWall(), [NONE, NONE], world)
    const before = state.fighters[0].airJumpsLeft

    state = step(state, [JUMP, NONE], world)
    const fighter = state.fighters[0]

    expect(fighter.state).toBe('air')
    expect(fighter.vy).toBeLessThan(0)
    // Salta hacia afuera de la pared.
    expect(fighter.vx).toBeLessThan(0)
    expect(fighter.airJumpsLeft).toBe(before)
  })

  it('se suelta al apretar en contra de la pared', () => {
    let state = step(besideTheWall(), [NONE, NONE], world)
    expect(state.fighters[0].state).toBe('cling')

    // La pared quedó a la derecha, así que soltarse es apretar izquierda.
    state = step(state, [LEFT, NONE], world)
    expect(state.fighters[0].state).toBe('air')
  })

  it('el presupuesto se agota y lo suelta', () => {
    let state = step(besideTheWall({ clingLeft: 5 }), [NONE, NONE], world)

    for (let frame = 0; frame < 8; frame += 1) state = step(state, [NONE, NONE], world)

    expect(state.fighters[0].state).toBe('air')
    expect(state.fighters[0].clingLeft).toBe(0)
  })

  it('no se puede colgar mientras te están mandando a volar', () => {
    // Si el agarre funcionara en hitstun, un golpe contra la pared sería una
    // salvada gratis en vez de un castigo.
    const stunned = step(besideTheWall({ hitstun: 20 }), [NONE, NONE], world)

    expect(stunned.fighters[0].state).toBe('hitstun')
  })

  it('aterrizar recarga el presupuesto', () => {
    const falling = withFighter(initialState(world, 1), 0, {
      y: SMALL_STAGE.ground.top - 256 * 40,
      grounded: false,
      state: 'air',
      clingLeft: 0,
    })

    let state = falling
    while (!state.fighters[0].grounded) state = step(state, [NONE, NONE], world)

    expect(state.fighters[0].clingLeft).toBe(OSO.wall.clingFrames)
  })
})
