/**
 * La sesión de red: lo que convierte dos simulaciones separadas en una partida.
 *
 * El modelo es **delay-based**, el más simple que funciona. Un input apretado en
 * el frame F no se juega en F: se juega en F + delay, en las dos máquinas. Ese
 * retraso es lo que le da tiempo al input del rival a cruzar la red antes de que
 * su frame tenga que simularse, y es la razón por la que las dos simulaciones
 * pueden avanzar en paralelo sin consultarse nada.
 *
 * Cuando el input del rival igual no llegó a tiempo, la simulación **se frena**.
 * Congelarse es feo pero es honesto: la alternativa sería adivinar el input que
 * falta y corregir después, que es rollback — y eso es M5. Un juego que se traba
 * medio segundo con mala conexión es preferible a uno donde cada uno vio una
 * partida distinta.
 *
 * Nada de acá adentro toca la simulación: `step()` recibe los dos inputs y no se
 * entera de que uno vino por un cable.
 */

import { hashState } from '../sim/hash'
import { NONE, type Input } from '../sim/input'
import { initialState, type MatchState, type PlayerIndex } from '../sim/state'
import { step } from '../sim/tick'
import type { World } from '../sim/world'
import { SIM_VERSION } from '../version'
import type { Transport } from './port'
import {
  CHECKSUM_EVERY,
  DEFAULT_INPUT_DELAY,
  hello,
  inputsMessage,
  queueMessage,
  readInputs,
  windowFor,
  type EndReason,
  type ProtocolErrorCode,
  type ServerMessage,
  type Slot,
} from './protocol'

export type SessionPhase =
  /** Conectando y saludando. */
  | 'connecting'
  /** En cola, esperando rival. */
  | 'queued'
  /** Jugando. */
  | 'playing'
  /** Esperando el input del rival: la simulación está detenida. */
  | 'stalled'
  | 'ended'

export interface SessionSnapshot {
  readonly phase: SessionPhase
  readonly state: MatchState | null
  readonly previous: MatchState | null
  /** Cuál de los dos peleadores es el jugador local. */
  readonly slot: Slot
  readonly opponent: string
  /** Frames seguidos esperando al rival. La vista lo usa para avisar. */
  readonly stalledFrames: number
}

export interface SessionListeners {
  onPhase?(phase: SessionPhase): void
  onEnd?(reason: EndReason, winner: Slot | null): void
  onError?(code: ProtocolErrorCode, message: string): void
}

export class NetSession {

  private phase: SessionPhase = 'connecting'
  private slot: Slot = 0
  private delay = DEFAULT_INPUT_DELAY
  private opponent = ''

  /** Inputs indexados por frame en el que se JUEGAN, no en el que se apretaron. */
  private local: Input[] = []
  private remote: Input[] = []

  /** El próximo frame a simular. */
  private frame = 0
  private stalledFrames = 0
  private reported = false
  private eventGameId: string | undefined = undefined

  private state: MatchState | null = null
  private previous: MatchState | null = null
  private detach: Array<() => void> = []

  constructor(
    private readonly transport: Transport,
    private readonly world: World,
    private readonly listeners: SessionListeners = {},
  ) {}

  /**
   * Se conecta, saluda y se pone en cola. Con `eventGameId`, en la cola de ese
   * concurso: la partida cuenta para su ranking.
   */
  start(token?: string, eventGameId?: string): void {
    this.eventGameId = eventGameId
    this.detach.push(this.transport.onMessage((message) => this.receive(message)))
    this.detach.push(
      this.transport.onClose(() => {
        if (this.phase !== 'ended') this.finish('abandoned', null)
      }),
    )

    this.transport.send(hello(token))
  }

  /**
   * Un tick del reloj. Devuelve si la simulación avanzó: cuando devuelve false,
   * la partida está esperando al rival y la vista tiene que seguir dibujando lo
   * mismo.
   */
  tick(sampled: Input): boolean {
    if (this.phase !== 'playing' && this.phase !== 'stalled') return false
    const state = this.state
    if (!state) return false

    const fromOpponent = this.remote[this.frame]
    if (fromOpponent === undefined) {
      // Se frena TODO: tampoco se lee el input local. El juego está detenido, y
      // seguir juntando inputs mientras tanto haría que al destrabarse saliera
      // media docena de acciones juntas.
      this.stalledFrames += 1
      this.setPhase('stalled')
      return false
    }

    this.setPhase('playing')
    this.stalledFrames = 0

    // Lo que se aprieta hoy se juega dentro de `delay` frames, y se manda ya.
    const playedAt = this.frame + this.delay
    this.local[playedAt] = sampled
    this.transport.send(inputsMessage(windowFor(playedAt, this.local)))

    const mine = this.local[this.frame] ?? NONE
    this.previous = state
    this.state = step(state, this.ordered(mine, fromOpponent), this.world)
    this.frame += 1

    this.report()
    return true
  }

  snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      state: this.state,
      previous: this.previous,
      slot: this.slot,
      opponent: this.opponent,
      stalledFrames: this.stalledFrames,
    }
  }

  dispose(): void {
    this.detach.forEach((off) => off())
    this.detach = []
    this.transport.close()
  }

  /**
   * El orden de los inputs es el orden de los peleadores, y no el de "yo y el
   * otro": los dos peers tienen que pasarle a `step()` exactamente la misma
   * tupla. Invertirlo de un solo lado sería un desync desde el primer frame.
   */
  private ordered(mine: Input, theirs: Input): readonly [Input, Input] {
    return this.slot === 0 ? [mine, theirs] : [theirs, mine]
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        // La fase se cambia ANTES de mandar: si ya hay alguien esperando, el
        // servidor contesta el `match` adentro de este mismo `send` y la
        // partida arranca acá nomás. Hacerlo después pisaría `playing` con
        // `queued` y la sesión se quedaría esperando una partida ya empezada.
        this.setPhase('queued')
        this.transport.send(queueMessage(this.eventGameId))
        return

      case 'queued':
        this.setPhase('queued')
        return

      case 'match':
        this.begin(message.slot, message.seed, message.inputDelay, message.opponent)
        return

      case 'inputs': {
        const window = readInputs(message)
        window.inputs.forEach((input, offset) => {
          const at = window.from + offset
          // Los mensajes traen frames repetidos contra un paquete demorado. El
          // primero que llega manda: si un reenvío pudiera cambiar lo ya
          // simulado, el rival podría reescribir su pasado.
          if (this.remote[at] === undefined) this.remote[at] = input
        })
        return
      }

      case 'desync':
        this.finish('desync', null)
        return

      case 'ended':
        this.finish(message.reason, message.winner)
        return

      case 'error':
        this.listeners.onError?.(message.code, message.message)
        this.setPhase('ended')
        return
    }
  }

  private begin(slot: Slot, seed: number, inputDelay: number, opponent: string): void {
    this.slot = slot
    this.delay = inputDelay
    this.opponent = opponent
    this.frame = 0
    this.reported = false
    this.stalledFrames = 0

    // Los primeros `delay` frames se juegan sin input: nadie apretó nada todavía
    // para esos frames. Dejarlos anotados de entrada es lo que evita que la
    // partida arranque trabada esperando algo que nunca va a llegar.
    this.local = Array.from({ length: inputDelay }, () => NONE)
    this.remote = Array.from({ length: inputDelay }, () => NONE)

    this.state = initialState(this.world, seed)
    this.previous = this.state
    this.setPhase('playing')
  }

  /**
   * El hash cada tantos frames y el resultado al final. Las dos cosas son lo que
   * el servidor necesita para hacer su trabajo: comparar que los dos vieron lo
   * mismo, y decidir el resultado sin creerle a uno solo.
   */
  private report(): void {
    const state = this.state
    if (!state) return

    if (this.frame % CHECKSUM_EVERY === 0) {
      this.transport.send({ type: 'checksum', frame: this.frame, hash: hashState(state) })
    }

    if (state.over && !this.reported) {
      this.reported = true
      this.transport.send({
        type: 'result',
        frame: this.frame,
        winner: state.winner === null ? null : (state.winner as PlayerIndex as Slot),
      })
    }
  }

  private finish(reason: EndReason, winner: Slot | null): void {
    if (this.phase === 'ended') return
    this.setPhase('ended')
    this.listeners.onEnd?.(reason, winner)
  }

  private setPhase(phase: SessionPhase): void {
    if (this.phase === phase) return
    this.phase = phase
    this.listeners.onPhase?.(phase)
  }
}

/** La versión que este cliente juega. El servidor la compara al saludar. */
export const CLIENT_SIM_VERSION = SIM_VERSION
