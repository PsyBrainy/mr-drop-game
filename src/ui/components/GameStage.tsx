import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { contentBox, fitInside, type Size } from '../lib/layout'

interface Props {
  /** ancho / alto del juego: define la forma del marco. */
  aspectRatio: number
  children: ReactNode
}

/**
 * `lock` no está en todos los navegadores (iOS no lo tiene) y los tipos del DOM
 * lo dan por seguro, así que se accede con una forma laxa y optional chaining.
 */
type OrientationLock = {
  lock?: (orientation: string) => Promise<void>
  unlock?: () => void
}

const orientation = () => screen.orientation as unknown as OrientationLock | undefined

export interface GameStageRef {
  enter: () => Promise<void>
  exit: () => Promise<void>
}

/**
 * Marco del juego con modo inmersivo.
 *
 * El modo inmersivo es CSS (position: fixed sobre todo el viewport) y el
 * fullscreen nativo es un extra encima. No al revés: Safari en iPhone no
 * permite fullscreen en elementos que no sean <video>, así que si dependiera
 * del API nativa el botón no haría nada en medio parque de celulares.
 */
export const GameStage = forwardRef<GameStageRef, Props>(function GameStage(
  { aspectRatio, children },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [immersive, setImmersive] = useState(false)
  const [frameSize, setFrameSize] = useState<Size | null>(null)
  const [portrait, setPortrait] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches,
  )

  const exit = useCallback(async () => {
    setImmersive(false)
    try {
      orientation()?.unlock?.()
    } catch {
      /* el navegador no permite soltar la orientación: no es grave */
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* ya estaba fuera de fullscreen */
    }
  }, [])

  const enter = useCallback(async () => {
    setImmersive(true)
    try {
      await stageRef.current?.requestFullscreen?.()
    } catch {
      /* iOS o permisos: queda el inmersivo por CSS, que alcanza */
    }
    try {
      await orientation()?.lock?.('landscape')
    } catch {
      /* iOS no lo soporta: se le avisa al jugador que gire el teléfono */
    }
  }, [])

  useImperativeHandle(ref, () => ({
    enter,
    exit,
  }), [enter, exit])

  // El usuario puede salir del fullscreen por fuera del botón (Esc, gesto atrás).
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setImmersive(false)
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(orientation: portrait)')
    const sync = () => setPortrait(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  // Sin esto la página de atrás sigue scrolleando bajo el juego en mobile.
  useEffect(() => {
    document.body.classList.toggle('is-immersive', immersive)
    return () => document.body.classList.remove('is-immersive')
  }, [immersive])

  // Si se sale de la pantalla del juego (volver, terminar la partida) hay que
  // soltar el fullscreen: el navegador no siempre lo hace solo en una SPA.
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    },
    [],
  )

  useEffect(() => {
    if (!immersive) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive, exit])

  /**
   * En modo inmersivo el marco se mide contra el escenario real en vez de
   * calcularse con unidades de viewport: en mobile el alto del viewport y el
   * del contenedor no coinciden mientras el navegador mueve su barra, y el área
   * segura del teléfono recorta todavía más. Midiendo, el marco no se puede pasar.
   */
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!immersive || !stage) {
      setFrameSize(null)
      return
    }

    const measure = () => setFrameSize(fitInside(aspectRatio, contentBox(stage)))
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    // iOS no siempre avisa por el observer cuando cambia la barra o se rota.
    window.addEventListener('orientationchange', measure)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', measure)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [immersive, aspectRatio])

  const needsRotate = immersive && portrait && aspectRatio > 1

  return (
    <div ref={stageRef} className={`game-stage ${immersive ? 'is-immersive' : ''}`}>
      <div
        className="game-frame"
        style={
          {
            '--game-ar': aspectRatio,
            ...(frameSize && { width: frameSize.width, height: frameSize.height }),
          } as CSSProperties
        }
      >
        {children}
        <button
          type="button"
          className="game-stage__toggle"
          onClick={() => void (immersive ? exit() : enter())}
          aria-label={immersive ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {immersive ? '✕' : '⛶'}
        </button>
      </div>

      {needsRotate && (
        <p className="game-stage__rotate" role="status">
          Girá el teléfono para jugar en grande
        </p>
      )}
    </div>
  )
})
