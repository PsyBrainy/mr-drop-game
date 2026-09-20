import kaplay, { type KAPLAYCtx } from 'kaplay'
import type { GameContext, GameHandle, GameModule } from '../GameModule'

export interface KaplaySetup {
  width: number
  height: number
  background: [number, number, number]
}

export interface KaplayGameDefinition {
  slug: string
  name: string
  howToPlay: string
  setup?: Partial<KaplaySetup>
  /** Arranca la escena. Devuelve un cleanup opcional además del quit() de Kaplay. */
  start(k: KAPLAYCtx, context: GameContext): void | (() => void)
}

const DEFAULTS: KaplaySetup = { width: 480, height: 720, background: [12, 18, 14] }

/**
 * Adaptador Kaplay -> GameModule: crea el canvas, inicializa el motor y
 * garantiza que destroy() lo apague aunque el juego falle al arrancar.
 *
 * Nota: Kaplay pausa su loop cuando `document.visibilityState` no es
 * "visible", así que en una pestaña de fondo el canvas se ve negro. Es
 * comportamiento del motor, no del juego.
 */
export function createKaplayGame(definition: KaplayGameDefinition): GameModule {
  const setup = { ...DEFAULTS, ...definition.setup }

  return {
    slug: definition.slug,
    name: definition.name,
    howToPlay: definition.howToPlay,

    mount(context: GameContext): GameHandle {
      const canvas = document.createElement('canvas')
      canvas.className = 'game-canvas'
      canvas.setAttribute('aria-label', definition.name)
      context.mountPoint.appendChild(canvas)

      const k = kaplay({
        canvas,
        width: setup.width,
        height: setup.height,
        background: setup.background,
        global: false,
        touchToMouse: true,
        crisp: true,
        pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
      })

      // Kaplay usa la fuente del sistema y la rasteriza en un atlas propio de
      // 2048x2048 por instancia: 16 MB de VRAM que se suman a los sprites.
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
        | WebGLRenderingContext
        | null

      const shutdown = () => {
        k.quit()

        // quit() no libera nada en el acto: engancha el teardown al "frameEnd"
        // siguiente. Para entonces la instancia nueva de un reinicio ya nació,
        // así que conviven dos contextos y dos atlas de fuente. En un teléfono
        // esa segunda reserva falla y el texto deja de dibujarse, mientras los
        // sprites grandes (que tienen textura propia, fuera del atlas) siguen
        // viéndose: se rompe el cartel pero no el juego.
        //
        // Soltamos el contexto a mano para que la memoria se libere ya. Kaplay
        // no escucha webglcontextlost y las llamadas WebGL sobre un contexto
        // perdido son no-ops, así que su teardown tardío corre igual sin fallar.
        gl?.getExtension('WEBGL_lose_context')?.loseContext()
        canvas.remove()
      }

      let cleanup: (() => void) | void
      try {
        cleanup = definition.start(k, context)
      } catch (error) {
        shutdown()
        throw error
      }

      let destroyed = false
      return {
        destroy() {
          if (destroyed) return
          destroyed = true
          try {
            cleanup?.()
          } finally {
            shutdown()
          }
        },
      }
    },
  }
}
