/**
 * Medidas y ajuste de MrDrop Run, sin nada de Kaplay para poder verificarlos
 * en tests. Los números de sprites salen de medir el contenido real de cada
 * PNG (bounding box del alfa), no de estimar a ojo.
 *
 * Los PNG de `public/` los genera `scripts/optimize-sprites.sh` a partir del
 * arte original de `assets-src/`, con un techo de 2048 px de lado. Si algún día
 * se regeneran con otro tamaño hay que volver a medirlos y actualizar este
 * archivo: las medidas de abajo están en píxeles del archivo servido.
 */

export const VIEW_W = 960
export const VIEW_H = 540

/** Tamaño real de las capas de fondo en `public/`. */
export const LAYER_W = 2048
export const LAYER_H = 480
export const BG_SCALE = VIEW_H / LAYER_H
export const TILE_W = LAYER_W * BG_SCALE

/** Línea donde apoyan las ruedas, dentro de la franja de asfalto. */
export const GROUND_Y = 496

/**
 * El jugador va bastante adentro de la pantalla, no pegado al borde: el
 * patrullero recién choca cuando terminó de pasarlo, así que todo lo que quede
 * a la izquierda es el espacio donde se ve la animación de choque.
 */
export const PLAYER_X = 250

export interface Sheet {
  key: string
  src: string
  frames: number
  /** Borde izquierdo del contenido dentro del frame. */
  left: number
  /** Línea de ruedas dentro del frame. */
  bottom: number
  /**
   * Ancho del contenido útil, sin las líneas de velocidad ni el humo. De acá
   * sale la escala de dibujo, así que dos hojas del mismo vehículo a distinta
   * resolución terminan ocupando lo mismo en pantalla.
   */
  contentWidth: number
  contentHeight: number
  /** Ancho de un frame en el PNG. El alfa del choque se desborda del contenido. */
  frameWidth: number
  frameHeight: number
  /** Columnas y filas de la grilla. La mayoría son una sola fila. */
  cols: number
  rows: number
}

/**
 * Cada hoja tiene padding transparente distinto y su propia resolución, así que
 * los sprites se posicionan por su contenido real y no por su centro: así el
 * vehículo apoya sobre el asfalto sin importar qué hoja se esté dibujando.
 */
export const TRUCK_RUN: Sheet = {
  key: 'mrdrop-truck-run',
  src: '/acelerando_6x2_672x384.png',
  frames: 12,
  left: 91,
  bottom: 174,
  contentWidth: 236,
  contentHeight: 118,
  frameWidth: 336,
  frameHeight: 192,
  cols: 6,
  rows: 2,
}

export const TRUCK_JUMP: Sheet = {
  key: 'mrdrop-truck-jump',
  src: '/jump_sheet_8x688x440.png',
  frames: 8,
  left: 40,
  bottom: 147,
  contentWidth: 180,
  contentHeight: 104,
  frameWidth: 256,
  frameHeight: 164,
  cols: 8,
  rows: 1,
}

export const COP_DRIVE: Sheet = {
  key: 'mrdrop-cop-drive',
  src: '/patrullero_marcha_4x1_980x644.png',
  frames: 4,
  left: 87,
  bottom: 270,
  contentWidth: 320,
  contentHeight: 183,
  frameWidth: 512,
  frameHeight: 336,
  cols: 4,
  rows: 1,
}

export const COP_CRASH: Sheet = {
  key: 'mrdrop-cop-crash',
  src: '/patrullero_choque_12x1_half.png',
  frames: 12,
  left: 29,
  bottom: 92,
  contentWidth: 107,
  contentHeight: 64,
  frameWidth: 170,
  frameHeight: 112,
  cols: 12,
  rows: 1,
}

/**
 * El pozo se alinea por el borde SUPERIOR de su contenido: la grieta se abre
 * hacia abajo desde el asfalto, así que lo que tiene que coincidir con la ruta
 * es el borde de arriba, no la base como en los vehículos.
 *
 * `pozo_rompiendo` arranca como una grieta chica y termina en el pozo abierto;
 * las medidas son las del ÚLTIMO frame, que es el que tiene que calzar con el
 * tamaño del loop de lava.
 */
export const POZO_BREAK: Sheet = {
  key: 'mrdrop-pozo-rompiendo',
  src: '/pozo_rompiendo_12x1_504x182.png',
  frames: 12,
  left: 0,
  bottom: 60,
  contentWidth: 170,
  contentHeight: 54,
  frameWidth: 170,
  frameHeight: 61,
  cols: 12,
  rows: 1,
}

export const POZO_LAVA: Sheet = {
  key: 'mrdrop-pozo-lava',
  src: '/pozo_lava_loop_6x1_504x182.png',
  frames: 6,
  left: 0,
  bottom: 122,
  contentWidth: 340,
  contentHeight: 113,
  frameWidth: 340,
  frameHeight: 123,
  cols: 6,
  rows: 1,
}

/**
 * El cogollo flota, así que se posiciona por el centro de su contenido y no por
 * la línea de ruedas como los vehículos.
 */
export const COGOLLO_SPIN: Sheet = {
  key: 'mrdrop-cogollo-giro',
  src: '/cogollo_giro_12x1_392x392.png',
  frames: 12,
  left: 30,
  bottom: 136,
  contentWidth: 117,
  contentHeight: 122,
  frameWidth: 170,
  frameHeight: 170,
  cols: 12,
  rows: 1,
}

export const COGOLLO_TAKEN: Sheet = {
  key: 'mrdrop-cogollo-agarrado',
  src: '/cogollo_agarrado_8x1_392x392.png',
  frames: 8,
  left: 36,
  bottom: 210,
  contentWidth: 189,
  contentHeight: 193,
  frameWidth: 256,
  frameHeight: 256,
  cols: 8,
  rows: 1,
}

/**
 * Dígitos para los carteles flotantes de puntaje. Frame 0 es el '+' y los
 * frames 1..10 son los dígitos 0..9. Es un sprite, no texto de Kaplay, así que
 * no lo toca el problema del atlas de fuente compartido.
 */
export const PUNTOS: Sheet = {
  key: 'mrdrop-puntos',
  src: '/puntos_digitos_63x63.png',
  frames: 11,
  left: 7,
  bottom: 62,
  contentWidth: 49,
  contentHeight: 56,
  frameWidth: 63,
  frameHeight: 63,
  cols: 11,
  rows: 1,
}

/** Frame del dígito `d` dentro de la hoja. El 0 está ocupado por el '+'. */
export function digitFrame(digit: number): number {
  return digit + 1
}

export const PUNTOS_PLUS_FRAME = 0

export const PUNTOS_H = 26
export const PUNTOS_SCALE = PUNTOS_H / PUNTOS.frameHeight
/** Separación entre dígitos. Un poco menos que el ancho del frame, que trae aire. */
export const PUNTOS_ADVANCE = PUNTOS_H * 0.82
/** Cuánto sube el cartel flotante y cuánto tarda en desaparecer. */
export const PUNTOS_RISE = 46
export const PUNTOS_SECONDS = 0.85

/** Los frames que arman un cartel de `+N`. */
export function pointsFrames(points: number): number[] {
  return [
    PUNTOS_PLUS_FRAME,
    ...String(points)
      .split('')
      .map((digit) => digitFrame(Number(digit))),
  ]
}

/**
 * Secuencia de la animación de marcha: la hoja `acelerando` trae un ciclo
 * completo de 12 frames, así que se recorre derecho y vuelve al principio.
 */
export const TRUCK_RUN_FRAMES = Array.from({ length: TRUCK_RUN.frames }, (_, i) => i)

/**
 * Ancho con el que se dibuja cada vehículo, en píxeles del canvas. Están al 75%
 * de lo que medían antes: con los vehículos más chicos entra más ruta en
 * pantalla y el choque del patrullero llega a verse completo. La física y las
 * velocidades de abajo están escaladas igual, así que se juega idéntico.
 */
export const TRUCK_W = 150
export const COP_W = 141

export function scaleFor(sheet: Sheet, displayWidth: number): number {
  return displayWidth / sheet.contentWidth
}

export const TRUCK_RUN_SCALE = scaleFor(TRUCK_RUN, TRUCK_W)
export const TRUCK_JUMP_SCALE = scaleFor(TRUCK_JUMP, TRUCK_W)
export const COP_DRIVE_SCALE = scaleFor(COP_DRIVE, COP_W)
export const COP_CRASH_SCALE = scaleFor(COP_CRASH, COP_W)

export const POZO_W = 124
export const POZO_BREAK_SCALE = scaleFor(POZO_BREAK, POZO_W)
export const POZO_LAVA_SCALE = scaleFor(POZO_LAVA, POZO_W)
export const POZO_H = POZO_LAVA.contentHeight * POZO_LAVA_SCALE
/**
 * Dónde cae el borde de arriba del pozo. Apenas por encima de la línea de
 * ruedas, así el borde del agujero queda al ras del asfalto y el hueco se abre
 * hacia abajo, adentro de la franja de ruta.
 */
export const POZO_TOP_Y = GROUND_Y - 4

/**
 * Desde dónde empieza a abrirse. El pozo entra a pantalla por fuera del borde,
 * así que si arrancara a romperse al aparecer, a velocidad baja se formaría
 * casi entero afuera y llegaría ya abierto. Espera a estar del todo a la vista.
 */
export const POZO_BREAK_START_X = VIEW_W - POZO_W

export const COGOLLO_W = 56
export const COGOLLO_SPIN_SCALE = scaleFor(COGOLLO_SPIN, COGOLLO_W)
/** La hoja de agarre tiene el cogollo más grande dentro del frame: misma escala visual. */
export const COGOLLO_TAKEN_SCALE = scaleFor(COGOLLO_TAKEN, COGOLLO_W)

export const TRUCK_H = TRUCK_RUN.contentHeight * TRUCK_RUN_SCALE
export const COP_H = COP_DRIVE.contentHeight * COP_DRIVE_SCALE
export const COGOLLO_H = COGOLLO_SPIN.contentHeight * COGOLLO_SPIN_SCALE

/** Borde superior del contenido dentro del frame, para lo que se abre hacia abajo. */
export function contentTop(sheet: Sheet): number {
  return sheet.bottom - sheet.contentHeight
}

/** Centro del contenido dentro del frame, para los sprites que flotan. */
export function contentCenter(sheet: Sheet): { x: number; y: number } {
  return {
    x: sheet.left + sheet.contentWidth / 2,
    y: sheet.bottom - sheet.contentHeight / 2,
  }
}

/** Cajas de colisión bastante más chicas que el sprite, como en el dino. */
/**
 * Fracciones del cuerpo real de la camioneta, medido sobre la hoja: así el
 * ajuste sobrevive a un cambio de sprites. Deja afuera los paragolpes y la
 * cabeza del oso, como corresponde a una caja generosa con el jugador.
 */
export const PLAYER_HIT = { dx: TRUCK_W * 0.18, w: TRUCK_W * 0.65, h: TRUCK_H * 0.8 }
export const COP_HIT = { dx: 26, w: 89, h: COP_H * 0.7 }
/**
 * El pozo es un agujero: la caja es una franja al ras del asfalto, bastante más
 * angosta que el dibujo. Hace falta despegar apenas del piso para salvarlo, pero
 * la franja es ancha, así que la dificultad está en el momento del salto.
 */
export const POZO_HIT = { w: 74, top: GROUND_Y - 16, h: 40 }
/** Cuánto hay que despegar del piso para no caer adentro. */
export const POZO_CLEARANCE = GROUND_Y - POZO_HIT.top

/** Generosa a propósito: el cogollo es un premio, no un obstáculo. */
export const COGOLLO_HIT = { w: 52, h: 52 }

/** Lo que suma cada cosa. */
export const POZO_POINTS = 10
export const COP_POINTS = 15
export const COGOLLO_POINTS = 30
/**
 * Altura a la que flota, medida al centro. La banda está elegida para que haya
 * que saltar sí o sí (no se alcanza manejando) pero se agarre con holgura en la
 * parte alta del salto. `budReach` verifica las dos cosas.
 */
export const COGOLLO_Y_MIN = 310
export const COGOLLO_Y_MAX = 360

export const LAYERS = [
  { key: 'mrdrop-capa-sky', src: '/capa_sky.png', factor: 0.08, z: 0 },
  { key: 'mrdrop-capa-far', src: '/capa_far.png', factor: 0.2, z: 1 },
  { key: 'mrdrop-capa-mid', src: '/capa_mid.png', factor: 0.38, z: 2 },
  { key: 'mrdrop-capa-near', src: '/capa_near.png', factor: 0.65, z: 3 },
  { key: 'mrdrop-capa-ground', src: '/capa_ground.png', factor: 1, z: 4 },
]

export interface Tuning {
  baseSpeed: number
  speedStep: number
  maxSpeed: number
  gravity: number
  jumpVelocity: number
  /** El patrullero viene de frente: se mueve más rápido que el decorado. */
  copSpeedFactor: number
  /** Segundos entre LLEGADAS de obstáculos al jugador, no entre apariciones. */
  minGapSeconds: number
  maxGapSeconds: number
  /**
   * Probabilidad de que el obstáculo que viene sea un patrullero en vez de un
   * pozo. El pozo es el obstáculo principal; el patrullero es el que aparece
   * cada tanto.
   */
  copChance: number
  /** Cuadros por segundo con los que se abre el pozo. */
  breakFps: number
  lavaFps: number
  /** Cuadros por segundo de la animación de choque. */
  crashFps: number
  budEveryMinSeconds: number
  budEveryMaxSeconds: number
  budSpinFps: number
  budTakenFps: number
  /** Cuadros por segundo de la marcha a velocidad inicial. */
  runFps: number
  /** Cuánto más rápido puede llegar a animarse cuando el juego se acelera. */
  maxRunAnimBoost: number
  /** Vibración del motor, en píxeles. Es solo dibujo: no toca la colisión. */
  engineBobPx: number
  engineBobHz: number
}

export const DEFAULT_TUNING: Tuning = {
  baseSpeed: 315,
  speedStep: 18,
  maxSpeed: 920,
  gravity: 1800,
  jumpVelocity: 715,
  copSpeedFactor: 1.3,
  minGapSeconds: 1.05,
  maxGapSeconds: 1.85,
  copChance: 0.12,
  breakFps: 22,
  lavaFps: 10,
  // Más rápida que antes por necesidad: con el techo de velocidad más alto, a
  // 18 fps la explosión del patrullero se salía de pantalla sin terminar.
  crashFps: 24,
  budEveryMinSeconds: 5,
  budEveryMaxSeconds: 9,
  budSpinFps: 14,
  budTakenFps: 16,
  runFps: 20,
  maxRunAnimBoost: 2.1,
  engineBobPx: 1.6,
  engineBobHz: 11,
}

/**
 * La velocidad sube por patrullero esquivado, no por puntaje: si no, agarrar un
 * cogollo (que vale 5) daría un salto de dificultad que el jugador no pidió.
 */
export type DeathCause = 'policia' | 'pozo'

/** Lo que dice el cartel según contra qué chocaste. */
export const DEATH_MESSAGES: Record<DeathCause, string> = {
  policia: '¡Atrapado!',
  pozo: 'Yendo al mecánico',
}

export function speedForDodged(dodged: number, tuning: Tuning): number {
  return Math.min(tuning.maxSpeed, tuning.baseSpeed + dodged * tuning.speedStep)
}

/**
 * La marcha se anima más rápido a medida que el juego acelera: con solo 3
 * frames dibujados, que el ritmo acompañe a la velocidad es lo que hace que se
 * lea como que la camioneta va más exigida.
 */
export function runAnimSpeed(speed: number, tuning: Tuning = DEFAULT_TUNING): number {
  return Math.min(tuning.maxRunAnimBoost, Math.max(1, speed / tuning.baseSpeed))
}

/** Amplitud de la vibración del motor a una velocidad dada. Solo visual. */
export function engineBob(speed: number, elapsed: number, tuning: Tuning = DEFAULT_TUNING): number {
  const intensity = Math.min(1.6, speed / tuning.baseSpeed)
  return Math.sin(elapsed * tuning.engineBobHz * Math.PI * 2) * tuning.engineBobPx * intensity
}

export function maxEngineBob(tuning: Tuning = DEFAULT_TUNING): number {
  return tuning.engineBobPx * 1.6
}

export function airTimeSeconds(tuning: Tuning): number {
  return (2 * tuning.jumpVelocity) / tuning.gravity
}

export function jumpApex(tuning: Tuning): number {
  return (tuning.jumpVelocity * tuning.jumpVelocity) / (2 * tuning.gravity)
}

export interface JumpWindow {
  /** Segundos que el jugador pasa por encima del techo de la caja rival. */
  aboveSeconds: number
  /** Segundos que las dos cajas se solapan en el eje horizontal. */
  overlapSeconds: number
  /** Margen de error que le queda al jugador. Si es <= 0, el juego es injusto. */
  marginSeconds: number
}

/**
 * La invariante de jugabilidad del juego: para que un salto bien cronometrado
 * pueda esquivar, el tiempo que el jugador pasa por encima del patrullero tiene
 * que superar al tiempo que las cajas se solapan horizontalmente. Si no, ni el
 * salto perfecto alcanza y el juego se vuelve imposible.
 */
function clearanceWindow(
  speed: number,
  heightToClear: number,
  combinedWidth: number,
  speedFactor: number,
  tuning: Tuning,
): JumpWindow {
  const { gravity: g, jumpVelocity: v } = tuning

  const discriminant = v * v - 2 * g * heightToClear
  const aboveSeconds = discriminant <= 0 ? 0 : (2 * Math.sqrt(discriminant)) / g
  const overlapSeconds = combinedWidth / (speed * speedFactor)

  return { aboveSeconds, overlapSeconds, marginSeconds: aboveSeconds - overlapSeconds }
}

export function jumpWindow(speed: number, tuning: Tuning = DEFAULT_TUNING): JumpWindow {
  return clearanceWindow(
    speed, COP_HIT.h, PLAYER_HIT.w + COP_HIT.w, tuning.copSpeedFactor, tuning,
  )
}

/**
 * El pozo es más exigente de lo que parece: como casi no hay que subir, el
 * jugador está "a salvo" durante casi todo el vuelo, pero la franja del pozo es
 * ancha y va a la velocidad de la ruta. La ventana la marca el ancho, no la altura.
 */
export function potholeWindow(speed: number, tuning: Tuning = DEFAULT_TUNING): JumpWindow {
  return clearanceWindow(speed, POZO_CLEARANCE, PLAYER_HIT.w + POZO_HIT.w, 1, tuning)
}

/**
 * El pozo tiene que terminar de abrirse antes de llegar al jugador: si llegara
 * a medio formar, se estaría saltando un agujero que todavía no es agujero.
 * El caso justo es a máxima velocidad, que es cuando menos tiempo hay.
 */
export function potholeOpensInTime(speed: number, tuning: Tuning = DEFAULT_TUNING): boolean {
  const breakSeconds = POZO_BREAK.frames / tuning.breakFps
  const secondsToPlayer = (POZO_BREAK_START_X - PLAYER_X) / speed
  return secondsToPlayer > breakSeconds
}

export interface CrashVisibility {
  /** Cuánto dura la animación de choque completa. */
  crashSeconds: number
  /** Cuánto dura la parte que importa: el derrape y la explosión. */
  explosionSeconds: number
  /** Cuánto tiempo queda en pantalla desde que arranca hasta que sale. */
  onScreenSeconds: number
}

/** Los últimos frames son la chatarra humeando; la explosión termina antes. */
const EXPLOSION_FRAMES = 8

/**
 * El patrullero choca recién cuando terminó de pasar al jugador, y desde ahí se
 * va con la ruta hacia la izquierda. Si sale de pantalla antes de terminar la
 * animación, el jugador nunca ve el choque — que es medio el premio por
 * esquivarlo bien.
 */
export function crashVisibility(
  speed: number,
  tuning: Tuning = DEFAULT_TUNING,
): CrashVisibility {
  const crashFrameW = COP_CRASH.frameWidth * COP_CRASH_SCALE
  // Arranca con el borde izquierdo del contenido en PLAYER_X - COP_W y sale
  // cuando todo el frame (explosión incluida) pasó el borde de la pantalla.
  const distance = PLAYER_X - COP_W + crashFrameW
  return {
    crashSeconds: COP_CRASH.frames / tuning.crashFps,
    explosionSeconds: EXPLOSION_FRAMES / tuning.crashFps,
    onScreenSeconds: distance / speed,
  }
}

export interface BudReach {
  /** Píxeles de solapamiento vertical con el jugador en el punto más alto. */
  overlapAtApex: number
  /** Si se alcanza sin saltar. Debe ser false: el cogollo se gana saltando. */
  reachableGrounded: boolean
}

export function budReach(budY: number, tuning: Tuning = DEFAULT_TUNING): BudReach {
  const apexBottom = GROUND_Y - jumpApex(tuning)
  const apexTop = apexBottom - PLAYER_HIT.h
  const budTop = budY - COGOLLO_HIT.h / 2
  const budBottom = budY + COGOLLO_HIT.h / 2

  return {
    overlapAtApex: Math.min(apexBottom, budBottom) - Math.max(apexTop, budTop),
    reachableGrounded: budBottom > GROUND_Y - PLAYER_HIT.h,
  }
}

/** Desde dónde entran los obstáculos en pantalla. */
export const OBSTACLE_SPAWN_X = VIEW_W + 40

/**
 * Segundos que tarda un obstáculo desde que aparece hasta que llega al jugador.
 * El patrullero viene de frente y el pozo va con la ruta, así que a la misma
 * velocidad de juego tardan distinto: por eso los obstáculos se programan por
 * su hora de LLEGADA y cada uno se suelta con su propia anticipación. Si se
 * programaran por hora de aparición, un patrullero detrás de un pozo llegaría
 * encima de él y no habría forma de saltar los dos.
 */
export function travelSeconds(speed: number, speedFactor: number): number {
  return (OBSTACLE_SPAWN_X - PLAYER_X) / (speed * speedFactor)
}

/**
 * Segundos entre que aparece el patrullero y que llega al jugador. Correr al
 * jugador hacia la derecha mejora cómo se ve el choque pero recorta esto, así
 * que conviene tenerlo medido.
 */
export function reactionSeconds(speed: number, tuning: Tuning = DEFAULT_TUNING): number {
  return travelSeconds(speed, tuning.copSpeedFactor)
}

/**
 * ¿Se puede soltar un cogollo que llegue en `budArrival` segundos?
 *
 * El cogollo obliga a saltar, así que no puede llegar justo ANTES de un
 * obstáculo: el jugador gastaría el salto en el premio y aterrizaría encima del
 * patrullero o adentro del pozo. Llegar JUNTO a un obstáculo en cambio está
 * bien, y hasta es lo más divertido: se salta una vez y se lleva las dos cosas.
 *
 * Compara horas de llegada, no de aparición: el cogollo va con la ruta y el
 * patrullero viene de frente, así que salir a la vez no significa llegar a la vez.
 */
export function budArrivalIsSafe(
  budArrival: number,
  obstacleArrivals: readonly number[],
  tuning: Tuning = DEFAULT_TUNING,
): boolean {
  const air = airTimeSeconds(tuning)
  return obstacleArrivals.every(
    (arrival) => !(budArrival > arrival - air && budArrival < arrival - 0.1),
  )
}

export function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}
