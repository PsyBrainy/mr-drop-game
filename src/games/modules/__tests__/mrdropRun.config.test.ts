import { describe, expect, it } from 'vitest'
import {
  airTimeSeconds,
  COP_H,
  COP_HIT,
  COP_CRASH_SCALE,
  budArrivalIsSafe,
  budReach,
  COGOLLO_POINTS,
  COP_POINTS,
  pointsFrames,
  POZO_POINTS,
  PUNTOS_PLUS_FRAME,
  COGOLLO_Y_MAX,
  COGOLLO_Y_MIN,
  crashVisibility,
  DEATH_MESSAGES,
  potholeOpensInTime,
  POZO_BREAK_START_X,
  potholeWindow,
  POZO_CLEARANCE,
  POZO_W,
  travelSeconds,
  PLAYER_X,
  reactionSeconds,
  COP_DRIVE,
  COP_DRIVE_SCALE,
  COP_CRASH,
  COP_W,
  DEFAULT_TUNING,
  GROUND_Y,
  jumpApex,
  jumpWindow,
  overlaps,
  PLAYER_HIT,
  speedForDodged,
  TILE_W,
  maxEngineBob,
  runAnimSpeed,
  TRUCK_H,
  TRUCK_RUN,
  TRUCK_RUN_FRAMES,
  VIEW_H,
  VIEW_W,
} from '../mrdropRun.config'

describe('jugabilidad', () => {
  it('un salto perfecto esquiva al patrullero a la velocidad inicial', () => {
    // Es el caso más exigente: a más velocidad el patrullero pasa más rápido
    // y el jugador está menos tiempo dentro de la zona de choque.
    const window = jumpWindow(DEFAULT_TUNING.baseSpeed)
    expect(window.marginSeconds).toBeGreaterThan(0.1)
  })

  it('sigue siendo esquivable en todo el rango de velocidad', () => {
    for (let score = 0; score <= 60; score += 1) {
      const speed = speedForDodged(score, DEFAULT_TUNING)
      expect(jumpWindow(speed).marginSeconds).toBeGreaterThan(0)
    }
  })

  it('el margen se agranda con la velocidad', () => {
    const lento = jumpWindow(DEFAULT_TUNING.baseSpeed).marginSeconds
    const rapido = jumpWindow(DEFAULT_TUNING.maxSpeed).marginSeconds
    expect(rapido).toBeGreaterThan(lento)
  })

  it('el salto pasa por encima del patrullero con aire de sobra', () => {
    expect(jumpApex(DEFAULT_TUNING)).toBeGreaterThan(COP_H * 1.5)
  })

  it('el jugador cabe en pantalla en el punto más alto del salto', () => {
    const alturaMaxima = GROUND_Y - jumpApex(DEFAULT_TUNING) - TRUCK_H
    expect(alturaMaxima).toBeGreaterThan(0)
  })

  it('la animación de salto dura lo mismo que el salto', () => {
    expect(airTimeSeconds(DEFAULT_TUNING)).toBeCloseTo(0.792, 2)
  })

  it('siempre se aterriza antes de que llegue el siguiente patrullero', () => {
    // Si el hueco mínimo fuera menor al vuelo, habría secuencias imposibles:
    // el jugador seguiría en el aire cuando entra el que viene atrás.
    expect(DEFAULT_TUNING.minGapSeconds).toBeGreaterThan(airTimeSeconds(DEFAULT_TUNING))
  })
})

describe('choque del patrullero', () => {
  it('el patrullero choca todavía dentro de la pantalla', () => {
    // La animación arranca cuando terminó de pasar al jugador: si PLAYER_X no
    // supera el ancho del patrullero, el choque empieza fuera de pantalla y el
    // jugador nunca lo ve.
    expect(PLAYER_X - COP_W).toBeGreaterThan(0)
  })

  it('la animación llega a verse entera a velocidad inicial', () => {
    const visible = crashVisibility(DEFAULT_TUNING.baseSpeed)
    expect(visible.onScreenSeconds).toBeGreaterThan(visible.crashSeconds)
  })

  it('la explosión se ve completa incluso a máxima velocidad', () => {
    // Los últimos frames son la chatarra humeando: perderse eso cuando todo va
    // rapidísimo está bien, perderse la explosión no.
    const visible = crashVisibility(DEFAULT_TUNING.maxSpeed)
    expect(visible.onScreenSeconds).toBeGreaterThan(visible.explosionSeconds)
  })

  it('deja tiempo de reacción humano incluso a máxima velocidad', () => {
    expect(reactionSeconds(DEFAULT_TUNING.maxSpeed)).toBeGreaterThan(0.6)
    expect(reactionSeconds(DEFAULT_TUNING.baseSpeed)).toBeGreaterThan(1.2)
  })
})

describe('pozo', () => {
  it('se salva en todo el rango de velocidad', () => {
    for (let dodged = 0; dodged <= 60; dodged += 1) {
      const speed = speedForDodged(dodged, DEFAULT_TUNING)
      expect(potholeWindow(speed).marginSeconds).toBeGreaterThan(0)
    }
  })

  it('el caso más exigente es la velocidad inicial', () => {
    expect(potholeWindow(DEFAULT_TUNING.baseSpeed).marginSeconds).toBeGreaterThan(0.1)
    expect(potholeWindow(DEFAULT_TUNING.maxSpeed).marginSeconds).toBeGreaterThan(
      potholeWindow(DEFAULT_TUNING.baseSpeed).marginSeconds,
    )
  })

  it('se abre estando ya a la vista', () => {
    // Entra a pantalla por fuera del borde: si empezara a romperse ahí, a
    // velocidad baja se formaría casi entero afuera y llegaría ya abierto.
    expect(POZO_BREAK_START_X + POZO_W).toBeLessThanOrEqual(VIEW_W)
  })

  it('termina de abrirse antes de llegar al jugador, incluso a máxima velocidad', () => {
    for (let dodged = 0; dodged <= 60; dodged += 1) {
      expect(potholeOpensInTime(speedForDodged(dodged, DEFAULT_TUNING))).toBe(true)
    }
  })

  it('alcanza con despegar apenas del piso', () => {
    // Es un agujero, no una pared: la dificultad tiene que estar en el momento
    // del salto y no en la altura.
    expect(POZO_CLEARANCE).toBeLessThan(COP_HIT.h / 2)
  })
})

describe('obstáculos mezclados', () => {
  it('el patrullero es el ocasional, no el principal', () => {
    expect(DEFAULT_TUNING.copChance).toBeLessThan(0.2)
  })

  it('sale un patrullero cada 10 segundos o más', () => {
    const gapPromedio = (DEFAULT_TUNING.minGapSeconds + DEFAULT_TUNING.maxGapSeconds) / 2
    const segundosEntrePatrulleros = gapPromedio / DEFAULT_TUNING.copChance
    expect(segundosEntrePatrulleros).toBeGreaterThan(10)
  })

  it('el patrullero y el pozo tardan distinto en llegar', () => {
    const speed = DEFAULT_TUNING.baseSpeed
    const pozo = travelSeconds(speed, 1)
    const patrullero = travelSeconds(speed, DEFAULT_TUNING.copSpeedFactor)
    expect(pozo - patrullero).toBeGreaterThan(0.4)
  })

  it('programarlos por aparición daría secuencias imposibles', () => {
    // Por eso se programan por hora de LLEGADA. Si se soltaran espaciados por
    // aparición, un patrullero detrás de un pozo llegaría con esta diferencia
    // de menos, y el jugador seguiría en el aire por el salto anterior.
    const speed = DEFAULT_TUNING.baseSpeed
    const ventaja = travelSeconds(speed, 1) - travelSeconds(speed, DEFAULT_TUNING.copSpeedFactor)
    const llegadaReal = DEFAULT_TUNING.minGapSeconds - ventaja
    expect(llegadaReal).toBeLessThan(airTimeSeconds(DEFAULT_TUNING))
  })
})

describe('carteles de puntaje', () => {
  it('arma el +N con el signo y los dígitos', () => {
    // La hoja tiene el '+' en el frame 0 y los dígitos 0..9 del 1 al 10.
    expect(pointsFrames(10)).toEqual([PUNTOS_PLUS_FRAME, 2, 1])
    expect(pointsFrames(30)).toEqual([PUNTOS_PLUS_FRAME, 4, 1])
    expect(pointsFrames(15)).toEqual([PUNTOS_PLUS_FRAME, 2, 6])
  })

  it('cubre los tres puntajes del juego', () => {
    for (const points of [POZO_POINTS, COP_POINTS, COGOLLO_POINTS]) {
      expect(pointsFrames(points).length).toBe(String(points).length + 1)
    }
  })
})

describe('cartel del final', () => {
  it('dice una cosa distinta según contra qué chocaste', () => {
    expect(DEATH_MESSAGES.policia).toBe('¡Atrapado!')
    expect(DEATH_MESSAGES.pozo).toBe('Yendo al mecánico')
  })
})

describe('cogollo', () => {
  const alturas = Array.from(
    { length: 11 },
    (_, i) => COGOLLO_Y_MIN + ((COGOLLO_Y_MAX - COGOLLO_Y_MIN) * i) / 10,
  )

  it('se agarra saltando en toda la banda de altura', () => {
    for (const y of alturas) {
      expect({ y, ...budReach(y) }).toMatchObject({ reachableGrounded: false })
      expect(budReach(y).overlapAtApex).toBeGreaterThan(12)
    }
  })

  it('nunca se alcanza manejando: el premio se gana saltando', () => {
    for (const y of alturas) {
      expect(budReach(y).reachableGrounded).toBe(false)
    }
  })

  it('no aparece justo antes de un obstáculo', () => {
    const air = airTimeSeconds(DEFAULT_TUNING)
    const llegadaObstaculo = 3
    // En pleno salto anterior: aterrizaría encima del obstáculo.
    expect(budArrivalIsSafe(llegadaObstaculo - air / 2, [llegadaObstaculo])).toBe(false)
  })

  it('sí puede aparecer junto a un obstáculo: se saltan los dos de una', () => {
    expect(budArrivalIsSafe(3, [3])).toBe(true)
  })

  it('sí puede aparecer bien lejos de cualquier obstáculo', () => {
    expect(budArrivalIsSafe(1, [3, 4.5])).toBe(true)
  })

  it('vale más que cualquier obstáculo: es el premio', () => {
    expect(COGOLLO_POINTS).toBe(30)
    expect(COGOLLO_POINTS).toBeGreaterThan(COP_POINTS)
    expect(COP_POINTS).toBeGreaterThan(POZO_POINTS)
  })

  it('no acelera el juego: la velocidad la marcan los patrulleros', () => {
    // Agarrar un cogollo suma 5 al puntaje; si la velocidad saliera del puntaje
    // sería un salto de dificultad de 5 patrulleros de golpe.
    const conCogollos = speedForDodged(3, DEFAULT_TUNING)
    expect(conCogollos).toBe(DEFAULT_TUNING.baseSpeed + 3 * DEFAULT_TUNING.speedStep)
  })
})

describe('animación de la camioneta', () => {
  it('usa todos los frames dibujados', () => {
    expect(new Set(TRUCK_RUN_FRAMES).size).toBe(TRUCK_RUN.frames)
  })

  it('recorre el ciclo en orden, de punta a punta', () => {
    expect(TRUCK_RUN_FRAMES).toEqual([...TRUCK_RUN_FRAMES].sort((a, b) => a - b))
    expect(TRUCK_RUN_FRAMES[0]).toBe(0)
    expect(TRUCK_RUN_FRAMES.at(-1)).toBe(TRUCK_RUN.frames - 1)
  })

  it('se anima más rápido cuando el juego acelera, con un techo', () => {
    expect(runAnimSpeed(DEFAULT_TUNING.baseSpeed)).toBe(1)
    expect(runAnimSpeed(DEFAULT_TUNING.maxSpeed)).toBeGreaterThan(1.5)
    expect(runAnimSpeed(DEFAULT_TUNING.maxSpeed * 10)).toBe(DEFAULT_TUNING.maxRunAnimBoost)
  })

  it('la vibración del motor es chica: es un detalle, no un salto', () => {
    // Además es solo dibujo, la colisión usa la posición real.
    expect(maxEngineBob()).toBeLessThan(POZO_CLEARANCE / 4)
  })
})

describe('velocidad', () => {
  it('arranca en la base y sube por patrullero esquivado', () => {
    expect(speedForDodged(0, DEFAULT_TUNING)).toBe(DEFAULT_TUNING.baseSpeed)
    expect(speedForDodged(5, DEFAULT_TUNING)).toBe(
      DEFAULT_TUNING.baseSpeed + 5 * DEFAULT_TUNING.speedStep,
    )
  })

  it('nunca supera el techo', () => {
    expect(speedForDodged(10_000, DEFAULT_TUNING)).toBe(DEFAULT_TUNING.maxSpeed)
  })
})

describe('escenario', () => {
  it('el decorado cubre el ancho del canvas con dos copias', () => {
    expect(TILE_W).toBeGreaterThan(VIEW_W)
  })

  it('la línea de piso cae dentro del asfalto', () => {
    // El asfalto arranca en y=842 de la capa de 1050 y llega hasta abajo.
    const asfaltoDesde = 842 * (VIEW_H / 1050)
    expect(GROUND_Y).toBeGreaterThan(asfaltoDesde)
    expect(GROUND_Y).toBeLessThan(VIEW_H)
  })

  it('las dos hojas del patrullero se dibujan del mismo tamaño', () => {
    // Están a resoluciones distintas: la escala sale del ancho de contenido
    // medido en cada PNG, no de una constante copiada a mano.
    expect(COP_DRIVE.contentWidth * COP_DRIVE_SCALE).toBeCloseTo(COP_W, 6)
    expect(COP_CRASH.contentWidth * COP_CRASH_SCALE).toBeCloseTo(COP_W, 6)
  })
})

describe('colisión', () => {
  it('las cajas son más chicas que los sprites', () => {
    expect(PLAYER_HIT.h).toBeLessThan(TRUCK_H)
    expect(COP_HIT.h).toBeLessThan(COP_H)
  })

  it('detecta solapamiento y lo descarta cuando no lo hay', () => {
    expect(overlaps(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true)
    expect(overlaps(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false)
    expect(overlaps(0, 0, 10, 10, 0, -10, 10, 10)).toBe(false)
  })
})
