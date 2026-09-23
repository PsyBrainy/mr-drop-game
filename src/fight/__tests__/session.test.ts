import { describe, expect, it } from 'vitest'
import { NetSession, type SessionPhase } from '../net/session'
import { CHECKSUM_EVERY, type EndReason, type Slot } from '../net/protocol'
import { formatHash, hashState } from '../sim/hash'
import { HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT, type Input } from '../sim/input'
import { FakeRelay, decodeInputsOf } from './relay'
import { testWorld } from './harness'
import type { World } from '../sim/world'

/**
 * La prueba de fuego del modelo entero: dos sesiones separadas, con inputs
 * distintos, unidas sólo por un relé que reparte bytes — y las dos simulaciones
 * tienen que terminar en el mismo estado, frame por frame.
 *
 * Si esto pasa, la decisión de no simular en el servidor está justificada. Si
 * fallara, todo lo demás no importa.
 */

const world = testWorld()

/** El mismo mundo con la gravedad cambiada: sirve para provocar un desync. */
const otherWorld: World = {
  ...world,
  tuning: [world.tuning[0], { ...world.tuning[1], gravity: world.tuning[1].gravity + 8 }],
}

interface Peer {
  readonly session: NetSession
  readonly phases: SessionPhase[]
  readonly ends: Array<{ reason: EndReason; winner: Slot | null }>
}

function connect(relay: FakeRelay, id: string): Peer {
  const phases: SessionPhase[] = []
  const ends: Array<{ reason: EndReason; winner: Slot | null }> = []
  const session = new NetSession(relay.connect(id), world, {
    onPhase: (phase) => phases.push(phase),
    onEnd: (reason, winner) => ends.push({ reason, winner }),
  })
  return { session, phases, ends }
}

/** Dos clientes conectados y emparejados, listos para tickear. */
function matched(relay = new FakeRelay()): { relay: FakeRelay; uno: Peer; dos: Peer } {
  const uno = connect(relay, 'uno')
  const dos = connect(relay, 'dos')
  uno.session.start()
  dos.session.start()
  return { relay, uno, dos }
}

/** Un guion de inputs que se repite: sirve para que cada peer haga algo distinto. */
function scripted(pattern: readonly Input[], frame: number): Input {
  return pattern[frame % pattern.length] ?? NONE
}

describe('dos peers jugando la misma partida', () => {
  it('llegan al mismo estado en cada frame', () => {
    const { uno, dos } = matched()

    const guionUno = [RIGHT, RIGHT, RIGHT | JUMP, NONE, LIGHT, NONE, LEFT, LEFT]
    const guionDos = [LEFT, NONE, JUMP, JUMP, NONE, HEAVY, NONE, RIGHT]

    for (let frame = 0; frame < 300; frame += 1) {
      uno.session.tick(scripted(guionUno, frame))
      dos.session.tick(scripted(guionDos, frame))

      const estadoUno = uno.session.snapshot().state
      const estadoDos = dos.session.snapshot().state
      expect(estadoUno).not.toBeNull()
      expect(formatHash(hashState(estadoUno!))).toBe(formatHash(hashState(estadoDos!)))
    }

    // Y no se quedaron quietos: hubo partida de verdad.
    expect(uno.session.snapshot().state!.tick).toBe(300)
    expect(uno.session.snapshot().state!.fighters[0].x).not.toBe(
      uno.session.snapshot().state!.fighters[1].x,
    )
  })

  it('cada uno maneja a su propio peleador', () => {
    const { uno, dos } = matched()

    // El primero en entrar es el peleador 0 y el segundo el 1. Si el orden de
    // los inputs se invirtiera de un solo lado, sería un desync desde el frame 1
    // — y acá se ve como que cada uno mueve al muñeco del otro.
    expect(uno.session.snapshot().slot).toBe(0)
    expect(dos.session.snapshot().slot).toBe(1)

    for (let frame = 0; frame < 40; frame += 1) {
      uno.session.tick(RIGHT)
      dos.session.tick(NONE)
    }

    const state = uno.session.snapshot().state!
    expect(state.fighters[0].vx).toBeGreaterThan(0)
    expect(state.fighters[1].vx).toBe(0)
  })
})

describe('el retraso de input', () => {
  it('lo que se aprieta hoy se juega unos frames después', () => {
    const { uno, dos } = matched(new FakeRelay(1, 4))

    // Apretar derecha desde el primer frame: los primeros 4 frames se simulan
    // con los inputs vacíos con los que arranca la partida.
    for (let frame = 0; frame < 4; frame += 1) {
      uno.session.tick(RIGHT)
      dos.session.tick(NONE)
      expect(uno.session.snapshot().state!.fighters[0].vx).toBe(0)
    }

    uno.session.tick(RIGHT)
    dos.session.tick(NONE)

    // Recién en el quinto se mueve: ese es el precio de que el input del rival
    // llegue a tiempo.
    expect(uno.session.snapshot().state!.fighters[0].vx).toBeGreaterThan(0)
  })

  it('manda los inputs con el frame en el que se van a jugar', () => {
    const { relay, uno, dos } = matched(new FakeRelay(1, 4))

    uno.session.tick(RIGHT)
    dos.session.tick(NONE)

    const enviado = relay.sentBy('uno').filter((m) => m.type === 'inputs')
    const primero = decodeInputsOf(enviado[0]!)
    // El input del frame 0 se juega en el 4, y así viaja.
    expect(primero.from + primero.inputs.length - 1).toBe(4)
  })
})

describe('cuando el input del rival no llega', () => {
  it('la simulación se frena en vez de adivinar', () => {
    const { relay, uno, dos } = matched(new FakeRelay(1, 4))

    // Cuatro frames andan con los inputs vacíos del arranque; del quinto en
    // adelante hace falta que el rival haya mandado algo.
    relay.hold = true
    for (let frame = 0; frame < 4; frame += 1) {
      expect(uno.session.tick(NONE)).toBe(true)
      dos.session.tick(NONE)
    }

    const frozen = uno.session.snapshot().state!.tick
    expect(uno.session.tick(NONE)).toBe(false)
    expect(uno.session.snapshot().phase).toBe('stalled')
    expect(uno.session.snapshot().state!.tick).toBe(frozen)

    // Congelarse es feo, pero adivinar el input que falta sería que cada uno vea
    // una partida distinta. Adivinar bien es rollback, y eso es M5.
    relay.hold = false
    relay.flush()
    expect(uno.session.tick(NONE)).toBe(true)
    expect(uno.session.snapshot().phase).toBe('playing')
    expect(uno.session.snapshot().state!.tick).toBe(frozen + 1)
  })

  it('avisa cuántos frames lleva esperando', () => {
    const { relay, uno, dos } = matched(new FakeRelay(1, 2))
    relay.hold = true
    for (let frame = 0; frame < 2; frame += 1) {
      uno.session.tick(NONE)
      dos.session.tick(NONE)
    }

    uno.session.tick(NONE)
    uno.session.tick(NONE)

    // La vista lo usa para poner un cartel en vez de parecer colgada.
    expect(uno.session.snapshot().stalledFrames).toBe(2)
  })
})

describe('lo que el cliente le cuenta al servidor', () => {
  it('manda el hash del estado cada tantos frames', () => {
    const { relay, uno, dos } = matched()

    for (let frame = 0; frame < CHECKSUM_EVERY * 2; frame += 1) {
      uno.session.tick(NONE)
      dos.session.tick(NONE)
    }

    const checksums = relay.sentBy('uno').filter((m) => m.type === 'checksum')
    expect(checksums).toHaveLength(2)
    expect(checksums.map((m) => (m.type === 'checksum' ? m.frame : 0))).toEqual([
      CHECKSUM_EVERY,
      CHECKSUM_EVERY * 2,
    ])
  })

  it('reporta el resultado una sola vez cuando termina la pelea', () => {
    const { relay, uno, dos } = matched()

    // Los dos caminan al vacío hasta quedarse sin vidas.
    for (let frame = 0; frame < 1200; frame += 1) {
      uno.session.tick(LEFT)
      dos.session.tick(LEFT)
      if (uno.session.snapshot().state?.over) break
    }

    expect(uno.session.snapshot().state!.over).toBe(true)

    for (let frame = 0; frame < 30; frame += 1) {
      uno.session.tick(NONE)
      dos.session.tick(NONE)
    }

    expect(relay.sentBy('uno').filter((m) => m.type === 'result')).toHaveLength(1)
  })

  it('el final del servidor termina la sesión de los dos', () => {
    const { uno, dos } = matched()

    for (let frame = 0; frame < 1200; frame += 1) {
      uno.session.tick(LEFT)
      dos.session.tick(LEFT)
      if (uno.ends.length > 0 && dos.ends.length > 0) break
    }

    expect(uno.ends).toHaveLength(1)
    expect(uno.ends[0]?.reason).toBe('result')
    // Los dos reportaron lo mismo, así que hay ganador.
    expect(uno.ends[0]?.winner).toBe(dos.ends[0]?.winner)
    expect(uno.session.snapshot().phase).toBe('ended')
  })
})

describe('cuando algo sale mal', () => {
  it('dos simulaciones que se separan se cortan solas', () => {
    /**
     * La red de seguridad de todo el modelo. Para provocar un desync de verdad,
     * uno de los dos juega con una gravedad distinta: es exactamente lo que
     * pasaría con dos clientes de versiones distintas que igual se emparejaran.
     * Desde el primer salto los estados divergen, y el hash del frame 30 los
     * delata sin que nadie tenga que notar nada raro.
     */
    const relay = new FakeRelay()
    const uno = connect(relay, 'uno')
    const torcido = new NetSession(relay.connect('dos'), otherWorld, {})
    uno.session.start()
    torcido.start()

    for (let frame = 0; frame <= CHECKSUM_EVERY; frame += 1) {
      uno.session.tick(JUMP)
      torcido.tick(JUMP)
    }

    expect(uno.ends).toHaveLength(1)
    expect(uno.ends[0]?.reason).toBe('desync')
    expect(uno.session.snapshot().phase).toBe('ended')
  })

  it('mientras coincidan, nadie corta nada', () => {
    const { uno, dos } = matched()

    for (let frame = 0; frame <= CHECKSUM_EVERY; frame += 1) {
      uno.session.tick(JUMP)
      dos.session.tick(RIGHT)
    }

    expect(uno.ends).toHaveLength(0)
    expect(uno.session.snapshot().phase).toBe('playing')
  })

  it('perder la conexión termina la sesión', () => {
    const { relay, uno } = matched()

    relay.disconnect('uno')

    expect(uno.session.snapshot().phase).toBe('ended')
    expect(uno.ends[0]?.reason).toBe('abandoned')
  })
})
