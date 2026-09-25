import { MOVE_KEYS, totalFrames, type MoveKey } from '../../fight/sim/attack'
import { toPixels } from '../../fight/sim/fixed'
import type { Fighter, PlayerIndex } from '../../fight/sim/state'
import type { FighterTuning } from '../../fight/sim/world'

/**
 * La capa que elige qué dibujo va en cada frame. No importa Kaplay: es una
 * función pura del `Fighter`, así que se prueba en Vitest igual que el resto de
 * los números de gameplay, y la vista sólo la consulta.
 *
 * Las hojas salen de `tools/rasta-sprites` (pixel art generado por código). Las
 * dos pieles son el mismo dibujo con otra paleta: `rasta` es el jugador 1 y
 * `rasta2`, con gi negro y guantes naranjas, el jugador 2. Mismo frame data, así
 * que la pelea es pareja; la ropa sólo sirve para saber quién es quién.
 */

/**
 * Lado de un frame en la hoja: 1 px de hoja = 1 px de arte = 1 px de mundo.
 *
 * Hasta A0 las hojas venían escaladas 2x "para retina", pero Kaplay dibuja con
 * filtro "nearest" (es su default y `createKaplayGame` no lo cambia), así que
 * agrandar en la GPU da exactamente los mismos píxeles — se verificó hoja por
 * hoja — con un cuarto del lugar en el atlas. Si alguien pasa `texFilter:
 * 'linear'`, el pixel art se ve borroso: ahí está la razón. Ver
 * docs/pelea/memoria.md, A0.
 */
export const FRAME_PX = 96

/** Píxeles de mundo por píxel de hoja. */
export const ART_SCALE = 1

/**
 * Dónde están los pies (el origen del personaje) dentro de cada frame, en px de
 * hoja. Es el mismo punto en todas las hojas, medido en el generador, y no está
 * centrado a propósito: el golpe fuerte llega 60 px adelante y atrás sólo hay
 * rastas. Con este punto el personaje apoya igual sea cual sea la hoja.
 */
export const ORIGIN_X = 34
export const FEET_Y = 90

export const SKINS = ['rasta', 'rasta2'] as const
export type Skin = (typeof SKINS)[number]

export function skinOf(index: PlayerIndex): Skin {
  return SKINS[index]
}

export type AnimName =
  | 'idle' | 'walk' | 'air' | 'land'
  | 'lightGround' | 'lightAir' | 'heavy' | 'recovery'
  | 'dodge' | 'wall' | 'hurt' | 'ko'

/** Cuántos dibujos tiene cada hoja y cómo se llama el archivo (sin la piel adelante). */
export const SHEETS: Record<AnimName, { readonly file: string; readonly frames: number }> = {
  idle: { file: 'idle_6x1_96', frames: 6 },
  walk: { file: 'walk_8x1_96', frames: 8 },
  air: { file: 'air_4x1_96', frames: 4 },
  land: { file: 'land_3x1_96', frames: 3 },
  lightGround: { file: 'light_ground_6x1_96', frames: 6 },
  lightAir: { file: 'light_air_6x1_96', frames: 6 },
  heavy: { file: 'heavy_9x1_96', frames: 9 },
  recovery: { file: 'recovery_6x1_96', frames: 6 },
  dodge: { file: 'dodge_6x1_96', frames: 6 },
  wall: { file: 'wall_4x1_96', frames: 4 },
  hurt: { file: 'hurt_2x1_96', frames: 2 },
  ko: { file: 'ko_6x1_96', frames: 6 },
}

export const ANIMS = Object.keys(SHEETS) as AnimName[]

export function spriteKey(skin: Skin, anim: AnimName): string {
  return `fight-${skin}-${anim}`
}

export function spriteSrc(skin: Skin, anim: AnimName): string {
  return `/${skin}_${SHEETS[anim].file}.png`
}

/**
 * Qué dibujo va en cada frame de cada ataque. Duración no es cantidad de
 * dibujos: el fuerte dura 38 frames con 9 dibujos, y cada uno se sostiene lo que
 * dice acá. Es el lugar para ajustar el timing sin volver a dibujar.
 *
 * El test verifica que cada tabla dure exactamente lo que el ataque y que el
 * dibujo del impacto aparezca en el primer frame activo, ni uno antes ni uno
 * después: si el juego pega antes de que se vea, el golpe se siente injusto.
 */
// startup 4 | activo 3 | recovery 10
const LIGHT_GROUND_POSES = [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5]
// startup 5 | activo 4 | recovery 12
const LIGHT_AIR_POSES = [0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]
// startup 12 (la pitada: se ve venir) | activo 4 | recovery 22
const HEAVY_POSES = [
  0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 4, 4,
  5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8,
]

// startup 3 (se encoge) | activo 6 (sube pegando) | recovery 16
const RECOVERY_POSES = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5]

/**
 * Hay once golpes y cuatro hojas dibujadas: mientras un golpe no tenga su dibujo,
 * usa el de su familia (rápido de piso, rápido aéreo, fuerte). Cuando un golpe
 * cambie de frame data en la sim, necesita su tabla propia acá — el test de
 * duración lo avisa — y más adelante su hoja propia.
 */
export const POSE_BY_FRAME: Record<MoveKey | 'dodge', readonly number[]> = {
  nLight: LIGHT_GROUND_POSES,
  sLight: LIGHT_GROUND_POSES,
  dLight: LIGHT_GROUND_POSES,
  nSig: HEAVY_POSES,
  sSig: HEAVY_POSES,
  dSig: HEAVY_POSES,
  nAir: LIGHT_AIR_POSES,
  sAir: LIGHT_AIR_POSES,
  dAir: LIGHT_AIR_POSES,
  recovery: RECOVERY_POSES,
  groundPound: HEAVY_POSES,
  // 26 frames: se agacha y se esconde en su nube
  dodge: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5],
}

/** Qué hoja dibuja cada golpe. */
export const MOVE_ANIM: Record<MoveKey, AnimName> = {
  nLight: 'lightGround',
  sLight: 'lightGround',
  dLight: 'lightGround',
  nSig: 'heavy',
  sSig: 'heavy',
  dSig: 'heavy',
  nAir: 'lightAir',
  sAir: 'lightAir',
  dAir: 'lightAir',
  recovery: 'recovery',
  groundPound: 'heavy',
}

/** El dibujo del golpe estirado en cada hoja: tiene que coincidir con el primer frame activo. */
const IMPACT_BY_ANIM: Partial<Record<AnimName, number>> = { lightGround: 2, lightAir: 2, heavy: 3, recovery: 1 }

export const IMPACT_POSE: Record<MoveKey, number> = Object.fromEntries(
  MOVE_KEYS.map((key) => [key, IMPACT_BY_ANIM[MOVE_ANIM[key]] ?? 0]),
) as Record<MoveKey, number>

/** Ticks que se sostiene cada dibujo en las animaciones en loop. */
export const LOOP_TICKS = { idle: 8, walk: 6, air: 6, wall: 8, ko: 4 } as const

/**
 * Por encima de esta velocidad (px por frame), un golpe recibido ya no es
 * "me pegaron": es salir volando, y se dibuja girando. Un fuerte a daño cero
 * sale a ~8, así que el giro aparece recién cuando el golpe te puede matar.
 */
export const KO_SPEED = 11

/** Frames de hitstun con la cara del impacto antes de pasar a la pose sostenida. */
const HURT_FLINCH = 4

export interface SpriteFrame {
  readonly anim: AnimName
  readonly frame: number
  /**
   * El dibujo mira a la derecha. Normalmente se espeja cuando el personaje mira
   * a la izquierda; colgado es al revés: la sim lo pone mirando para el lado
   * contrario a la pared (de ahí salta) y el dibujo tiene la pared adelante.
   */
  readonly flip: boolean
}

function clampIndex(table: readonly number[], frame: number): number {
  return table[Math.min(Math.max(frame, 0), table.length - 1)] ?? 0
}

function loop(frames: number, ticks: number, clock: number): number {
  return Math.floor(clock / ticks) % frames
}

export function spriteFrame(fighter: Fighter): SpriteFrame {
  const flip = fighter.facing === -1
  const t = fighter.stateFrames

  switch (fighter.state) {
    case 'walk':
      return { anim: 'walk', frame: loop(SHEETS.walk.frames, LOOP_TICKS.walk, t), flip }

    case 'air': {
      // Subiendo: los dos primeros dibujos (rastas colgando); bajando, los otros
      // dos (rastas para arriba). La y de la pantalla crece hacia abajo.
      const rising = fighter.vy < 0
      const base = rising ? 0 : 2
      return { anim: 'air', frame: base + loop(2, LOOP_TICKS.air, t), flip }
    }

    case 'land':
      return { anim: 'land', frame: Math.min(t, SHEETS.land.frames - 1), flip }

    case 'attack': {
      if (fighter.attack === null) break
      const table = POSE_BY_FRAME[fighter.attack]
      return { anim: MOVE_ANIM[fighter.attack], frame: clampIndex(table, t), flip }
    }

    case 'dodge':
      return { anim: 'dodge', frame: clampIndex(POSE_BY_FRAME.dodge, t), flip }

    case 'cling':
      return { anim: 'wall', frame: loop(SHEETS.wall.frames, LOOP_TICKS.wall, t), flip: !flip }

    case 'hitstun': {
      const vx = toPixels(fighter.vx)
      const vy = toPixels(fighter.vy)
      if (Math.sqrt(vx * vx + vy * vy) > KO_SPEED) {
        // Gira en el sentido en el que vuela, no en el que miraba.
        return { anim: 'ko', frame: loop(4, LOOP_TICKS.ko, t), flip: vx < 0 }
      }
      return { anim: 'hurt', frame: t < HURT_FLINCH ? 0 : 1, flip }
    }

    case 'idle':
    case 'dead':
      break
  }

  return { anim: 'idle', frame: loop(SHEETS.idle.frames, LOOP_TICKS.idle, t), flip }
}

/** Para los tests: cuánto dura cada tabla contra lo que dura de verdad el movimiento. */
export function expectedLength(key: MoveKey | 'dodge', tuning: FighterTuning): number {
  return key === 'dodge' ? tuning.dodge.frames : totalFrames(tuning.moves[key])
}
