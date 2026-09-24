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
import { step, TICKS_PER_SECOND } from '../../fight/sim/tick'
import { initialState, type MatchState } from '../../fight/sim/state'
import { botStep, createBot, type Bot } from '../../fight/bot/bot'
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

/**
 * Después de tanto tiempo en la cola sin rival, se ofrece pelear contra la
 * máquina. Se ofrece y no se impone: la cola sigue buscando mientras tanto, y
 * nadie termina contra un bot sin haberlo elegido.
 */
export const BOT_OFFER_SECONDS = 10

/** El nombre del rival de la máquina. El HUD le agrega la marca BOT al lado. */
export const BOT_NAME = 'Rasta Bot'

/** Qué decir al terminar contra el bot: que quede claro que no fue contra una persona. */
export function botEndingMessage(winner: 0 | 1 | null): string {
  if (winner === null) return 'Empate contra la máquina'
  return winner === 0 ? '¡Le ganaste a la máquina!' : 'Te ganó la máquina'
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

  // Online contra una persona, o local contra el bot cuando no apareció nadie.
  // Pasar al bot corta la sesión de red: desde ahí la pelea es de este
  // navegador solo, no viaja al servidor y no cuenta para nada.
  let mode: 'online' | 'bot' = 'online'
  let queuedTicks = 0
  let offering = false
  let vsBot: { state: MatchState; previous: MatchState; bot: Bot } | null = null

  const session = new NetSession(transport, world, {
    onPhase: () => {
      if (mode === 'online') hud()
    },
    onEnd: (reason, winner) => {
      if (mode === 'bot') return
      ended = true
      hud()
      context.onGameOver(0, { message: endingMessage(reason, winner, session.snapshot().slot) })
    },
    onError: (code, message) => {
      if (mode === 'bot') return
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

  const startBotMatch = (): void => {
    if (mode === 'bot') return
    mode = 'bot'
    offering = false
    overlay.offerBot(null)
    overlay.setStatus(null)
    session.dispose()

    const seed = (Math.random() * 0x7fffffff) | 0
    const state = initialState(world, seed)
    vsBot = { state, previous: state, bot: createBot(seed, 'normal') }
    camera = initialCamera(world, VIEW)
    previousCamera = camera

    // El jugador siempre es el 0 contra el bot, y el bot se marca como tal.
    overlay.setLocal(0)
    overlay.setBot(1)
    overlay.setNames(['…', BOT_NAME])
    void myFightName().then((mine) => overlay.setNames([mine, BOT_NAME]))
    overlay.update([panelOf(state.fighters[0], world.rules), panelOf(state.fighters[1], world.rules)])
  }

  const tickBot = (): void => {
    if (!vsBot || ended) return
    const decided = botStep(vsBot.bot, vsBot.state, 1, world)
    const next = step(vsBot.state, [pressed[0] | touch.mask(), decided.input], world)
    vsBot = { state: next, previous: vsBot.state, bot: decided.bot }

    previousCamera = camera
    camera = approachCamera(camera, targetCamera(next, world, VIEW))
    overlay.update([panelOf(next.fighters[0], world.rules), panelOf(next.fighters[1], world.rules)])

    if (next.over) {
      ended = true
      context.onGameOver(0, { message: botEndingMessage(next.winner) })
    }
  }

  const clock = startFixedClock(() => {
    if (ended) return
    if (mode === 'bot') {
      tickBot()
      return
    }

    // En la cola: pasado un rato sin rival, se ofrece el bot. Si aparece
    // alguien, el cartel se va solo.
    const phase = session.snapshot().phase
    if (phase === 'queued') {
      queuedTicks += 1
      if (!offering && queuedTicks >= BOT_OFFER_SECONDS * TICKS_PER_SECOND) {
        offering = true
        overlay.offerBot(startBotMatch)
      }
    } else if (offering) {
      offering = false
      overlay.offerBot(null)
    }

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
    if (mode === 'bot' && vsBot) {
      const alpha = Math.min(1, clock.alpha())
      const shown: Camera = {
        x: previousCamera.x + (camera.x - previousCamera.x) * alpha,
        y: previousCamera.y + (camera.y - previousCamera.y) * alpha,
        scale: previousCamera.scale + (camera.scale - previousCamera.scale) * alpha,
      }
      drawMatch(k, shown, vsBot.state, vsBot.previous, alpha)
      overlay.placeTags(tagAnchors(shown, vsBot.state, vsBot.previous, alpha))
      return
    }

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
    if (!disposed && mode === 'online') session.start(token)
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
    'A y D para moverte, W saltar, F golpe rápido, G golpe fuerte, H esquive, S bajarse de una plataforma. ' +
    'Nadie tiene vida: el daño que acumulás hace que te manden más lejos, y se pierde una vida al salir de la pantalla. ' +
    'Si llegás al costado de la plataforma te podés colgar y saltar desde ahí. ' +
    'Cuando aparezca "esperando al rival" la partida se frena hasta que llegue su jugada: nadie adivina nada.',
  setup: { width: VIEW.width, height: VIEW.height, background: [COLORS.sky[0], COLORS.sky[1], COLORS.sky[2]] },
  start,
})
