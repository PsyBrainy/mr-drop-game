import type { KAPLAYCtx } from 'kaplay'
import { createKaplayGame } from '../kaplay/createKaplayGame'
import type { GameContext } from '../GameModule'
import {
  approachCamera,
  initialCamera,
  targetCamera,
  type Camera,
} from '../../fight/camera'
import { startFixedClock } from '../../fight/clock'
import { OSO } from '../../fight/data/characters/oso'
import { SMALL_STAGE } from '../../fight/data/stage'
import { NONE, type Input } from '../../fight/sim/input'
import { TICKS_PER_SECOND } from '../../fight/sim/tick'
import { DEFAULT_RULES, type World } from '../../fight/sim/world'
import { NetSession, type SessionPhase } from '../../fight/net/session'
import type { Slot } from '../../fight/net/protocol'
import {
  createWebSocketTransport,
  currentFightToken,
  fightServerConfigured,
  fightServerUrl,
} from '../../infrastructure/ws/WebSocketTransport'
import { listenKeyboard } from './fightControls'
import { COLORS, drawMatch, loadFightAssets, tagAnchors, VIEW } from './fightView'
import { createFightHud, panelOf } from './fightHud'
import { createTouchControls } from './fightTouch'
import { myFightName, rivalFightName } from '../../infrastructure/ws/fightNames'

/**
 * La pelea online: dos personas, dos máquinas, una simulación por cabeza.
 *
 * Es la misma vista que la local — dibuja un `MatchState` y nada más. Lo único
 * que cambia es de dónde sale ese estado: en vez de simular con dos teclados,
 * simula con el propio y con los inputs que el rival manda por el cable. La
 * sesión de red (`NetSession`) hace de puente y la simulación no se entera.
 *
 * Los carteles de "buscando rival" y "esperando" salen por el HUD de React y no
 * por el canvas: la regla del atlas de fuente de Kaplay vale acá igual que en
 * todos los juegos del repo.
 */

const PHASE_LABELS: Record<SessionPhase, string> = {
  connecting: 'Conectando…',
  queued: 'Buscando rival…',
  playing: 'Peleando',
  stalled: 'Esperando al rival…',
  ended: 'Terminó',
}

/** Después de tantos frames trabado, se avisa: medio segundo ya se nota. */
const STALL_WARNING = 30

function describe(phase: SessionPhase, stalledFrames: number): string {
  if (phase !== 'stalled') return PHASE_LABELS[phase]
  const seconds = (stalledFrames / TICKS_PER_SECOND).toFixed(1)
  return stalledFrames > STALL_WARNING ? `Esperando al rival… ${seconds}s` : PHASE_LABELS.stalled
}

function start(k: KAPLAYCtx, context: GameContext): () => void {
  const world: World = {
    stage: SMALL_STAGE,
    tuning: [OSO, OSO],
    rules: DEFAULT_RULES,
  }

  if (!fightServerConfigured) {
    // Mejor decirlo que intentar conectarse a cualquier lado y quedar colgado.
    context.onStatusChange({ Estado: 'Falta configurar VITE_FIGHT_WS_URL' })
    context.onGameOver(0, { message: 'No hay servidor de peleas configurado' })
    return () => {}
  }

  loadFightAssets(k)
  const overlay = createFightHud(context.mountPoint, VIEW)
  // Teclado y dedos son el mismo byte para la sim: se juntan con un OR.
  const touch = createTouchControls(context.mountPoint)
  overlay.setNames(['…', '…'])

  // El teclado escribe en las dos ranuras, pero online sólo se usa la primera:
  // las teclas son siempre las mismas y a qué peleador mueven lo decide el lugar
  // que dio el servidor.
  const pressed: [Input, Input] = [NONE, NONE]
  const unlisten = listenKeyboard(pressed)

  const transport = createWebSocketTransport(fightServerUrl)
  let ended = false

  const session = new NetSession(transport, world, {
    onPhase: () => hud(),
    onEnd: (reason, winner) => {
      ended = true
      hud()
      context.onGameOver(0, { message: endingMessage(reason, winner, session.snapshot().slot) })
    },
    onError: (code, message) => {
      ended = true
      overlay.setStatus(code)
      context.onGameOver(0, { message })
    },
  })

  let camera = initialCamera(world, VIEW)
  let previousCamera = camera

  // Los nombres se piden una sola vez, cuando el servidor dice quién es el rival
  // y en qué lugar quedó cada uno. Mientras tanto el cartel dice "…".
  let namesAsked = false
  const askNames = (me: Slot, opponent: string): void => {
    namesAsked = true
    overlay.setLocal(me)
    void Promise.all([myFightName(), rivalFightName(opponent)]).then(([mine, theirs]) => {
      overlay.setNames(me === 0 ? [mine, theirs] : [theirs, mine])
    })
  }

  const hud = (): void => {
    const snapshot = session.snapshot()
    const state = snapshot.state
    overlay.setStatus(snapshot.phase === 'playing' ? null : describe(snapshot.phase, snapshot.stalledFrames))
    if (!state) return
    if (!namesAsked) askNames(snapshot.slot, snapshot.opponent)
    overlay.update([panelOf(state.fighters[0], world.rules), panelOf(state.fighters[1], world.rules)])
  }

  const clock = startFixedClock(() => {
    if (ended) return

    const advanced = session.tick(pressed[0] | touch.mask())
    const state = session.snapshot().state
    if (!state) return

    // La cámara sólo se mueve cuando la simulación se movió: si siguiera
    // suavizando mientras la partida está trabada esperando al rival, parecería
    // que el juego anda cuando en realidad está detenido.
    if (advanced) {
      previousCamera = camera
      camera = approachCamera(camera, targetCamera(state, world, VIEW))
      hud()
    }
  }, TICKS_PER_SECOND)

  k.onDraw(() => {
    const snapshot = session.snapshot()
    const state = snapshot.state
    if (!state) return

    const alpha = snapshot.phase === 'stalled' ? 1 : Math.min(1, clock.alpha())
    const shown: Camera = {
      x: previousCamera.x + (camera.x - previousCamera.x) * alpha,
      y: previousCamera.y + (camera.y - previousCamera.y) * alpha,
      scale: previousCamera.scale + (camera.scale - previousCamera.scale) * alpha,
    }
    const previous = snapshot.previous ?? state
    drawMatch(k, shown, state, previous, alpha)
    overlay.placeTags(tagAnchors(shown, state, previous, alpha))
  })

  hud()

  // El token se pide antes de saludar. Si el jugador no tiene sesión se saluda
  // sin token y el servidor decide: con invitados habilitados entra igual, y si
  // no, contesta AUTH_REQUIRED y el HUD lo muestra.
  let disposed = false
  void currentFightToken().then((token) => {
    if (!disposed) session.start(token)
  })

  return () => {
    disposed = true
    clock.stop()
    unlisten()
    session.dispose()
    overlay.destroy()
    touch.destroy()
  }
}

/**
 * Qué decirle al jugador según cómo terminó. El final importa tanto como la
 * pelea: no es lo mismo perder que quedarse sin rival.
 */
export function endingMessage(
  reason: string,
  winner: Slot | null,
  me: Slot,
): string {
  switch (reason) {
    case 'result':
      if (winner === null) return '¡Empate!'
      return winner === me ? '¡Ganaste!' : 'Perdiste'
    case 'forfeit':
      return winner === me ? 'Tu rival se fue: ganaste' : 'Te fuiste de la pelea'
    case 'desync':
      return 'Las dos partidas dejaron de coincidir y se cortó'
    case 'disagreement':
      return 'No coincidieron los resultados: la pelea no cuenta'
    default:
      return 'La pelea terminó'
  }
}

export default createKaplayGame({
  slug: 'fight-online',
  name: 'Pelea (online, 1v1)',
  howToPlay:
    'A y D para moverte, W saltar, F golpe rápido, G golpe fuerte, S esquive. ' +
    'Nadie tiene vida: el daño que acumulás hace que te manden más lejos, y se pierde una vida al salir de la pantalla. ' +
    'Si llegás al costado de la plataforma te podés colgar y saltar desde ahí. ' +
    'Cuando aparezca "esperando al rival" la partida se frena hasta que llegue su jugada: nadie adivina nada.',
  setup: { width: VIEW.width, height: VIEW.height, background: [COLORS.sky[0], COLORS.sky[1], COLORS.sky[2]] },
  start,
})
