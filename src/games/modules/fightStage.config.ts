import type { Camera } from '../../fight/camera'
import { toPixels } from '../../fight/sim/fixed'
import { SMALL_STAGE } from '../../fight/data/stage'

/**
 * El arte del escenario "Terraza": una azotea flotando de noche sobre la ciudad.
 * Sale de `tools/fight-stage/stage.py` (pixel art generado por código).
 *
 * Es sólo vista. La plataforma de verdad es `SMALL_STAGE.ground`; el dibujo se
 * acomoda a ella, y el test verifica que la cornisa caiga justo sobre el piso
 * que pisa la sim — si no, los personajes flotarían o se hundirían en el techo.
 */

/** El cielo va en espacio de pantalla: no se mueve con la cámara, como una estrella. */
export const SKY = {
  key: 'fight-terraza-sky',
  src: '/terraza_cielo_960x540.png',
  width: 960,
  height: 540,
} as const

export interface StageLayer {
  readonly key: string
  readonly src: string
  /** Rectángulo en px de mundo (coordenadas de la capa, ver `layerCamera`). */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /**
   * Cuánto sigue a la cámara: 0 es pegado a la pantalla, 1 es el mundo. Lo lejos
   * se mueve menos, y así la ciudad tiene profundidad sin que nadie la modele.
   */
  readonly parallax: number
  /**
   * El color de la última fila del dibujo. Debajo de la capa se pinta un
   * rectángulo de este color: cuando la cámara baja a seguir a alguien que se
   * cae, no se ve el cielo por debajo de la ciudad.
   */
  readonly floor: readonly [number, number, number]
}

/** De lejos a cerca: se dibujan en este orden. */
export const LAYERS: readonly StageLayer[] = [
  {
    key: 'fight-terraza-far',
    src: '/terraza_lejos_1400x460.png',
    x: -220, y: 140, width: 1400, height: 460,
    parallax: 0.25,
    floor: [64, 40, 80],
  },
  {
    key: 'fight-terraza-mid',
    src: '/terraza_medio_1700x560.png',
    x: -370, y: 80, width: 1700, height: 560,
    parallax: 0.5,
    floor: [40, 35, 71],
  },
]

/**
 * La azotea. Está hecha a 2 px de textura por px de mundo, como los peleadores,
 * y es más grande que el piso: arriba lleva la guirnalda y las macetas, y abajo
 * la losa rota. `surfaceY` es la línea de la cornisa en la textura.
 */
export const PLATFORM = {
  key: 'fight-terraza-platform',
  src: '/terraza_plataforma_1180x470.png',
  x: 185,
  y: 350,
  width: 590,
  height: 235,
  textureScale: 2,
  surfaceY: 140,
  /** Dónde empieza y termina el bloque de ladrillos en la textura (los caños del costado). */
  wallLeftX: 30,
  wallRightX: 1150,
} as const

/**
 * Las plataformas flotantes (las de `SMALL_STAGE.platforms`): una pasarela de
 * chapa con una tira de luces rasta abajo. Un solo dibujo para todas: el ancho
 * de la textura es el del piso más `insetX` de cada lado (los soportes), y
 * `surfaceY` es la línea donde se pisa, en px de textura.
 */
export const SOFT_PLATFORM = {
  key: 'fight-terraza-soft',
  src: '/terraza_flotante_256x60.png',
  width: 128,
  height: 30,
  textureScale: 2,
  insetX: 4,
  surfaceY: 6,
} as const

/**
 * El punto alrededor del cual gira el parallax: el encuadre de arranque. Con la
 * cámara ahí, todas las capas se ven como se dibujaron.
 */
export const PARALLAX_ANCHOR = {
  x: toPixels(SMALL_STAGE.ground.left + SMALL_STAGE.ground.right) / 2,
  y: toPixels(SMALL_STAGE.ground.top) - 90,
}

/**
 * La cámara que ve una capa: se mueve y hace zoom una fracción de lo que se
 * mueve la de verdad. Con `parallax` 1 es la cámara del juego.
 */
export function layerCamera(camera: Camera, parallax: number): Camera {
  return {
    x: PARALLAX_ANCHOR.x + (camera.x - PARALLAX_ANCHOR.x) * parallax,
    y: PARALLAX_ANCHOR.y + (camera.y - PARALLAX_ANCHOR.y) * parallax,
    scale: 1 + (camera.scale - 1) * parallax,
  }
}

export const STAGE_SPRITES = [SKY, ...LAYERS, PLATFORM, SOFT_PLATFORM] as const
