import type { GameObj, KAPLAYCtx } from 'kaplay'
import { createKaplayGame } from '../kaplay/createKaplayGame'
import { readNumber, type GameContext } from '../GameModule'
import {
  airTimeSeconds,
  budArrivalIsSafe,
  COGOLLO_HIT,
  COGOLLO_POINTS,
  COGOLLO_SPIN,
  COGOLLO_SPIN_SCALE,
  COGOLLO_TAKEN,
  COGOLLO_TAKEN_SCALE,
  COGOLLO_W,
  COP_POINTS,
  COGOLLO_Y_MAX,
  COGOLLO_Y_MIN,
  contentCenter,
  contentTop,
  BG_SCALE,
  COP_CRASH,
  COP_CRASH_SCALE,
  COP_DRIVE,
  COP_DRIVE_SCALE,
  COP_HIT,
  COP_W,
  DEATH_MESSAGES,
  DEFAULT_TUNING,
  engineBob,
  GROUND_Y,
  LAYERS,
  OBSTACLE_SPAWN_X,
  overlaps,
  PLAYER_HIT,
  pointsFrames,
  PUNTOS,
  PUNTOS_ADVANCE,
  PUNTOS_RISE,
  PUNTOS_SCALE,
  PUNTOS_SECONDS,
  PLAYER_X,
  POZO_BREAK,
  POZO_BREAK_SCALE,
  POZO_BREAK_START_X,
  POZO_HIT,
  POZO_LAVA,
  POZO_LAVA_SCALE,
  POZO_POINTS,
  POZO_TOP_Y,
  POZO_W,
  runAnimSpeed,
  speedForDodged,
  travelSeconds,
  TILE_W,
  TRUCK_JUMP,
  TRUCK_JUMP_SCALE,
  TRUCK_RUN,
  TRUCK_RUN_FRAMES,
  TRUCK_W,
  TRUCK_RUN_SCALE,
  VIEW_H,
  VIEW_W,
  type DeathCause,
  type Sheet,
  type Tuning,
} from './mrdropRun.config'

interface Cop {
  obj: GameObj
  sheet: Sheet
  scale: number
  /** Borde izquierdo del contenido, en coordenadas del mundo. */
  x: number
  crashed: boolean
  scored: boolean
}

interface Popup {
  objs: GameObj[]
  x: number
  y: number
  life: number
}

interface Pothole {
  obj: GameObj
  sheet: Sheet
  scale: number
  /** Borde izquierdo del contenido, en coordenadas del mundo. */
  x: number
  breaking: boolean
  scored: boolean
  opened: boolean
  openFor: number
}

interface Bud {
  obj: GameObj
  sheet: Sheet
  scale: number
  /** Centro del contenido, en coordenadas del mundo. */
  x: number
  y: number
  taken: boolean
  takenFor: number
}

/** Deja el contenido del sprite con su borde izquierdo en x y sus ruedas en y. */
function place(obj: GameObj, sheet: Sheet, scale: number, x: number, y: number) {
  obj.pos.x = x - sheet.left * scale
  obj.pos.y = y - sheet.bottom * scale
}

/** Deja el borde superior del contenido en y. Para lo que se abre hacia abajo. */
function placeTop(obj: GameObj, sheet: Sheet, scale: number, x: number, topY: number) {
  obj.pos.x = x - sheet.left * scale
  obj.pos.y = topY - contentTop(sheet) * scale
}

/** Deja el centro del contenido del sprite en (cx, cy). Para lo que flota. */
function placeCenter(obj: GameObj, sheet: Sheet, scale: number, cx: number, cy: number) {
  const center = contentCenter(sheet)
  obj.pos.x = cx - center.x * scale
  obj.pos.y = cy - center.y * scale
}

export default createKaplayGame({
  slug: 'mrdrop-run',
  name: 'MrDrop Run',
  howToPlay:
    'Saltá los patrulleros con espacio, clic o tocando la pantalla. Cada uno que esquivás suma un punto y todo se acelera.',
  setup: { width: VIEW_W, height: VIEW_H, background: [10, 12, 28] },

  start(k: KAPLAYCtx, context: GameContext) {
    const tuning: Tuning = {
      baseSpeed: readNumber(context.config, 'baseSpeed', DEFAULT_TUNING.baseSpeed),
      speedStep: readNumber(context.config, 'speedStep', DEFAULT_TUNING.speedStep),
      maxSpeed: readNumber(context.config, 'maxSpeed', DEFAULT_TUNING.maxSpeed),
      gravity: readNumber(context.config, 'gravity', DEFAULT_TUNING.gravity),
      jumpVelocity: readNumber(context.config, 'jumpVelocity', DEFAULT_TUNING.jumpVelocity),
      copSpeedFactor: readNumber(context.config, 'copSpeedFactor', DEFAULT_TUNING.copSpeedFactor),
      minGapSeconds: readNumber(context.config, 'minGapSeconds', DEFAULT_TUNING.minGapSeconds),
      maxGapSeconds: readNumber(context.config, 'maxGapSeconds', DEFAULT_TUNING.maxGapSeconds),
      crashFps: readNumber(context.config, 'crashFps', DEFAULT_TUNING.crashFps),
      copChance: readNumber(context.config, 'copChance', DEFAULT_TUNING.copChance),
      breakFps: readNumber(context.config, 'breakFps', DEFAULT_TUNING.breakFps),
      lavaFps: readNumber(context.config, 'lavaFps', DEFAULT_TUNING.lavaFps),
      budEveryMinSeconds: readNumber(
        context.config, 'budEveryMinSeconds', DEFAULT_TUNING.budEveryMinSeconds,
      ),
      budEveryMaxSeconds: readNumber(
        context.config, 'budEveryMaxSeconds', DEFAULT_TUNING.budEveryMaxSeconds,
      ),
      budSpinFps: readNumber(context.config, 'budSpinFps', DEFAULT_TUNING.budSpinFps),
      budTakenFps: readNumber(context.config, 'budTakenFps', DEFAULT_TUNING.budTakenFps),
      runFps: readNumber(context.config, 'runFps', DEFAULT_TUNING.runFps),
      maxRunAnimBoost: readNumber(
        context.config, 'maxRunAnimBoost', DEFAULT_TUNING.maxRunAnimBoost,
      ),
      engineBobPx: readNumber(context.config, 'engineBobPx', DEFAULT_TUNING.engineBobPx),
      engineBobHz: readNumber(context.config, 'engineBobHz', DEFAULT_TUNING.engineBobHz),
    }

    const airTime = airTimeSeconds(tuning)

    k.loadSprite(TRUCK_RUN.key, TRUCK_RUN.src, {
      sliceX: TRUCK_RUN.cols,
      sliceY: TRUCK_RUN.rows,
      anims: { run: { frames: TRUCK_RUN_FRAMES, loop: true, speed: tuning.runFps } },
    })
    k.loadSprite(TRUCK_JUMP.key, TRUCK_JUMP.src, {
      sliceX: TRUCK_JUMP.frames,
      anims: {
        // El ciclo de salto dura exactamente lo que el jugador está en el aire.
        jump: { from: 0, to: TRUCK_JUMP.frames - 1, loop: false, speed: TRUCK_JUMP.frames / airTime },
      },
    })
    k.loadSprite(COP_DRIVE.key, COP_DRIVE.src, {
      sliceX: COP_DRIVE.frames,
      anims: { drive: { from: 0, to: COP_DRIVE.frames - 1, loop: true, speed: 12 } },
    })
    k.loadSprite(POZO_BREAK.key, POZO_BREAK.src, {
      sliceX: POZO_BREAK.frames,
      anims: {
        break: { from: 0, to: POZO_BREAK.frames - 1, loop: false, speed: tuning.breakFps },
      },
    })
    k.loadSprite(POZO_LAVA.key, POZO_LAVA.src, {
      sliceX: POZO_LAVA.frames,
      anims: { lava: { from: 0, to: POZO_LAVA.frames - 1, loop: true, speed: tuning.lavaFps } },
    })
    k.loadSprite(COGOLLO_SPIN.key, COGOLLO_SPIN.src, {
      sliceX: COGOLLO_SPIN.frames,
      anims: {
        spin: { from: 0, to: COGOLLO_SPIN.frames - 1, loop: true, speed: tuning.budSpinFps },
      },
    })
    k.loadSprite(COGOLLO_TAKEN.key, COGOLLO_TAKEN.src, {
      sliceX: COGOLLO_TAKEN.frames,
      anims: {
        taken: { from: 0, to: COGOLLO_TAKEN.frames - 1, loop: false, speed: tuning.budTakenFps },
      },
    })
    k.loadSprite(COP_CRASH.key, COP_CRASH.src, {
      sliceX: COP_CRASH.frames,
      anims: { crash: { from: 0, to: COP_CRASH.frames - 1, loop: false, speed: tuning.crashFps } },
    })
    k.loadSprite(PUNTOS.key, PUNTOS.src, { sliceX: PUNTOS.cols })
    for (const layer of LAYERS) k.loadSprite(layer.key, layer.src)

    let disposed = false
    let phase: 'running' | 'dead' = 'running'
    let score = 0
    let reportedScore = -1
    let speed = tuning.baseSpeed
    let topSpeed = tuning.baseSpeed

    let deathCause: DeathCause = 'policia'
    let elapsed = 0
    let playerY = GROUND_Y
    let velocityY = 0
    let grounded = true

    const cops: Cop[] = []
    const potholes: Pothole[] = []
    /** Segundos hasta que el próximo obstáculo LLEGUE al jugador. */
    let nextArrivalIn = 2.2
    let nextIsCop = false
    const breakSeconds = POZO_BREAK.frames / tuning.breakFps

    const popups: Popup[] = []
    const buds: Bud[] = []
    let budsTaken = 0
    let dodged = 0
    let nextBudIn = k.rand(tuning.budEveryMinSeconds, tuning.budEveryMaxSeconds)
    const takenSeconds = COGOLLO_TAKEN.frames / tuning.budTakenFps

    k.onLoad(() => {
      if (disposed) return

      // ---- parallax -------------------------------------------------------
      const tiles = LAYERS.map((layer) => ({
        factor: layer.factor,
        offset: 0,
        sprites: [0, 1].map((i) =>
          k.add([
            k.sprite(layer.key),
            k.pos(i * TILE_W, 0),
            k.anchor('topleft'),
            k.scale(BG_SCALE),
            k.z(layer.z),
          ]),
        ),
      }))

      // ---- jugador --------------------------------------------------------
      const truckRun = k.add([
        k.sprite(TRUCK_RUN.key, { anim: 'run' }),
        k.pos(0, 0),
        k.anchor('topleft'),
        k.scale(TRUCK_RUN_SCALE),
        k.z(10),
      ])
      const truckJump = k.add([
        k.sprite(TRUCK_JUMP.key),
        k.pos(0, 0),
        k.anchor('topleft'),
        k.scale(TRUCK_JUMP_SCALE),
        k.z(10),
      ])
      truckJump.hidden = true

      const pushStatus = () => context.onStatusChange({ Cogollos: budsTaken })
      pushStatus()

      // ---- entrada --------------------------------------------------------
      function jump() {
        if (phase !== 'running' || !grounded) return
        grounded = false
        velocityY = -tuning.jumpVelocity
        truckRun.hidden = true
        truckJump.hidden = false
        truckJump.play('jump')
      }

      k.onKeyPress('space', jump)
      k.onKeyPress('up', jump)
      k.onKeyPress('w', jump)
      k.onMousePress(jump)

      // ---- patrulleros ----------------------------------------------------
      function spawnPothole() {
        const obj = k.add([
          // Sin animación todavía: entra como una grieta y se abre una vez que
          // está del todo a la vista.
          k.sprite(POZO_BREAK.key, { frame: 0 }),
          k.pos(0, 0),
          k.anchor('topleft'),
          k.scale(POZO_BREAK_SCALE),
          k.z(5),
        ])
        const pothole: Pothole = {
          obj,
          sheet: POZO_BREAK,
          scale: POZO_BREAK_SCALE,
          x: OBSTACLE_SPAWN_X,
          breaking: false,
          scored: false,
          opened: false,
          openFor: 0,
        }
        placeTop(obj, pothole.sheet, pothole.scale, pothole.x, POZO_TOP_Y)
        potholes.push(pothole)
      }

      /** Terminó de abrirse: pasa al loop de lava, que es la hoja grande. */
      function openPothole(pothole: Pothole) {
        pothole.opened = true
        k.destroy(pothole.obj)
        pothole.obj = k.add([
          k.sprite(POZO_LAVA.key, { anim: 'lava' }),
          k.pos(0, 0),
          k.anchor('topleft'),
          k.scale(POZO_LAVA_SCALE),
          k.z(5),
        ])
        pothole.sheet = POZO_LAVA
        pothole.scale = POZO_LAVA_SCALE
        placeTop(pothole.obj, pothole.sheet, pothole.scale, pothole.x, POZO_TOP_Y)
      }

      function spawnCop() {
        const obj = k.add([
          k.sprite(COP_DRIVE.key, { anim: 'drive' }),
          k.pos(0, 0),
          k.anchor('topleft'),
          k.scale(COP_DRIVE_SCALE),
          k.z(11),
        ])
        const cop: Cop = {
          obj,
          sheet: COP_DRIVE,
          scale: COP_DRIVE_SCALE,
          x: OBSTACLE_SPAWN_X,
          crashed: false,
          scored: false,
        }
        place(obj, cop.sheet, cop.scale, cop.x, GROUND_Y)
        cops.push(cop)
      }

      /** Lo esquivó limpio: el patrullero se va al pasto atrás del jugador. */
      function crashCop(cop: Cop) {
        cop.crashed = true
        k.destroy(cop.obj)
        cop.obj = k.add([
          k.sprite(COP_CRASH.key, { anim: 'crash' }),
          k.pos(0, 0),
          k.anchor('topleft'),
          k.scale(COP_CRASH_SCALE),
          k.z(9),
        ])
        cop.sheet = COP_CRASH
        cop.scale = COP_CRASH_SCALE
        place(cop.obj, cop.sheet, cop.scale, cop.x, GROUND_Y)
      }

      /**
       * Cartel flotante de `+N`, armado con la hoja de dígitos. No usa texto de
       * Kaplay a propósito: ver la regla en GameModule.ts.
       */
      function popPoints(points: number, x: number, y: number) {
        const frames = pointsFrames(points)
        const width = (frames.length - 1) * PUNTOS_ADVANCE
        const objs = frames.map((frame) =>
          k.add([
            k.sprite(PUNTOS.key, { frame }),
            k.pos(0, 0),
            k.anchor('center'),
            k.scale(PUNTOS_SCALE),
            k.opacity(1),
            k.z(20),
          ]),
        )
        popups.push({ objs, x: x - width / 2, y, life: 0 })
      }

      // ---- cogollos -------------------------------------------------------
      function spawnBud() {
        const obj = k.add([
          k.sprite(COGOLLO_SPIN.key, { anim: 'spin' }),
          k.pos(0, 0),
          k.anchor('topleft'),
          k.scale(COGOLLO_SPIN_SCALE),
          k.z(12),
        ])
        const bud: Bud = {
          obj,
          sheet: COGOLLO_SPIN,
          scale: COGOLLO_SPIN_SCALE,
          x: VIEW_W + COGOLLO_W,
          y: k.rand(COGOLLO_Y_MIN, COGOLLO_Y_MAX),
          taken: false,
          takenFor: 0,
        }
        placeCenter(obj, bud.sheet, bud.scale, bud.x, bud.y)
        buds.push(bud)
      }

      function takeBud(bud: Bud) {
        bud.taken = true
        k.destroy(bud.obj)
        bud.obj = k.add([
          k.sprite(COGOLLO_TAKEN.key, { anim: 'taken' }),
          k.pos(0, 0),
          k.anchor('topleft'),
          k.scale(COGOLLO_TAKEN_SCALE),
          k.z(12),
        ])
        bud.sheet = COGOLLO_TAKEN
        bud.scale = COGOLLO_TAKEN_SCALE
        placeCenter(bud.obj, bud.sheet, bud.scale, bud.x, bud.y)

        budsTaken += 1
        score += COGOLLO_POINTS
        popPoints(COGOLLO_POINTS, bud.x, bud.y - 26)
        pushStatus()
      }

      function die(cause: DeathCause) {
        if (phase !== 'running') return
        phase = 'dead'
        deathCause = cause
        // Se congela el frame que estaba a la vista: si murió en el aire, queda
        // en el aire. Cambiar de hoja acá haría saltar el sprite.
        truckRun.stop()
        truckJump.stop()
        k.shake(12)

        // Un instante para que se lea el choque y la app muestra el cartel.
        k.wait(0.7, () => {
          if (!disposed) {
            context.onGameOver(score, {
              message: DEATH_MESSAGES[deathCause],
              reason: deathCause,
              obstaculos: dodged,
              cogollos: budsTaken,
              topSpeed: Math.round(topSpeed),
            })
          }
        })
      }

      // ---- loop -----------------------------------------------------------
      k.onUpdate(() => {
        const dt = k.dt()
        if (phase === 'running') elapsed += dt
        const worldStep = phase === 'running' ? speed * dt : 0

        for (const tile of tiles) {
          tile.offset = (tile.offset + worldStep * tile.factor) % TILE_W
          tile.sprites[0]!.pos.x = -tile.offset
          tile.sprites[1]!.pos.x = -tile.offset + TILE_W
        }

        if (phase === 'running') {
          if (!grounded) {
            velocityY += tuning.gravity * dt
            playerY += velocityY * dt
            if (playerY >= GROUND_Y) {
              playerY = GROUND_Y
              velocityY = 0
              grounded = true
              truckJump.hidden = true
              truckRun.hidden = false
              truckRun.play('run')
            }
          }

          // El hueco se mide en tiempo: así sigue siendo saltable a cualquier
          // velocidad, y la dificultad pasa a ser el tiempo de reacción, que sí
          // se achica a medida que todo se acelera.
          // Cada obstáculo se suelta con su propia anticipación para que todos
          // lleguen espaciados igual, aunque el patrullero venga más rápido que
          // la ruta y el pozo vaya con ella.
          nextArrivalIn -= dt
          const lead = travelSeconds(speed, nextIsCop ? tuning.copSpeedFactor : 1)
          if (nextArrivalIn <= lead) {
            if (nextIsCop) spawnCop()
            else spawnPothole()
            nextArrivalIn += k.rand(tuning.minGapSeconds, tuning.maxGapSeconds)
            nextIsCop = k.rand(0, 1) < tuning.copChance
          }

          // El cogollo obliga a saltar, así que no se pone si hay un patrullero
          // por entrar: elegir entre el premio y el salto que salva se siente
          // injusto. Si el momento no sirve, se reintenta enseguida.
          nextBudIn -= dt
          if (nextBudIn <= 0) {
            // El cogollo viaja con la ruta, así que llega cuando llega: hay que
            // comparar su hora de llegada con la de los obstáculos, no el
            // momento en que se sueltan.
            const budArrival = travelSeconds(speed, 1)
            const arrivals = [nextArrivalIn, nextArrivalIn + tuning.minGapSeconds]
            if (budArrivalIsSafe(budArrival, arrivals, tuning)) {
              spawnBud()
              nextBudIn = k.rand(tuning.budEveryMinSeconds, tuning.budEveryMaxSeconds)
            } else {
              nextBudIn = 0.3
            }
          }
        }

        // La vibración del motor es SOLO dibujo: la caja de colisión de abajo
        // sigue usando playerY, así que no cambia en nada la jugabilidad.
        const bob = grounded && phase === 'running' ? engineBob(speed, elapsed, tuning) : 0
        truckRun.animSpeed = runAnimSpeed(speed, tuning)
        place(truckRun, TRUCK_RUN, TRUCK_RUN_SCALE, PLAYER_X, playerY + bob)
        place(truckJump, TRUCK_JUMP, TRUCK_JUMP_SCALE, PLAYER_X, playerY)

        const playerBox = {
          x: PLAYER_X + PLAYER_HIT.dx,
          y: playerY - PLAYER_HIT.h,
          w: PLAYER_HIT.w,
          h: PLAYER_HIT.h,
        }

        for (let i = cops.length - 1; i >= 0; i -= 1) {
          const cop = cops[i]!
          // Una vez chocado se queda pegado al decorado y se va con la ruta.
          cop.x -= worldStep * (cop.crashed ? 1 : tuning.copSpeedFactor)
          place(cop.obj, cop.sheet, cop.scale, cop.x, GROUND_Y)

          if (phase === 'running' && !cop.crashed) {
            if (
              overlaps(
                playerBox.x, playerBox.y, playerBox.w, playerBox.h,
                cop.x + COP_HIT.dx, GROUND_Y - COP_HIT.h, COP_HIT.w, COP_HIT.h,
              )
            ) {
              die('policia')
            } else if (!cop.scored && cop.x + COP_W < PLAYER_X) {
              cop.scored = true
              dodged += 1
              score += COP_POINTS
              popPoints(COP_POINTS, PLAYER_X + TRUCK_W / 2, GROUND_Y - 96)
              speed = speedForDodged(dodged, tuning)
              topSpeed = Math.max(topSpeed, speed)
              crashCop(cop)
            }
          }

          if (cop.x < -COP_W * 2.5) {
            k.destroy(cop.obj)
            cops.splice(i, 1)
          }
        }

        for (let i = potholes.length - 1; i >= 0; i -= 1) {
          const pothole = potholes[i]!
          pothole.x -= worldStep
          placeTop(pothole.obj, pothole.sheet, pothole.scale, pothole.x, POZO_TOP_Y)

          if (!pothole.opened && pothole.x <= POZO_BREAK_START_X) {
            if (!pothole.breaking) {
              pothole.breaking = true
              pothole.obj.play('break')
            }
            pothole.openFor += dt
            if (pothole.openFor >= breakSeconds) openPothole(pothole)
          }

          if (
            phase === 'running'
            && pothole.opened
            && overlaps(
              playerBox.x, playerBox.y, playerBox.w, playerBox.h,
              pothole.x + (POZO_W - POZO_HIT.w) / 2, POZO_HIT.top, POZO_HIT.w, POZO_HIT.h,
            )
          ) {
            die('pozo')
          }

          // Pasarlo sin caer adentro también suma: antes el pozo no daba puntos.
          if (phase === 'running' && !pothole.scored && pothole.x + POZO_W < PLAYER_X) {
            pothole.scored = true
            dodged += 1
            score += POZO_POINTS
            popPoints(POZO_POINTS, PLAYER_X + TRUCK_W / 2, GROUND_Y - 96)
            speed = speedForDodged(dodged, tuning)
            topSpeed = Math.max(topSpeed, speed)
          }

          if (pothole.x < -POZO_W * 2) {
            k.destroy(pothole.obj)
            potholes.splice(i, 1)
          }
        }

        for (let i = buds.length - 1; i >= 0; i -= 1) {
          const bud = buds[i]!
          bud.x -= worldStep
          placeCenter(bud.obj, bud.sheet, bud.scale, bud.x, bud.y)

          if (bud.taken) {
            bud.takenFor += dt
            if (bud.takenFor >= takenSeconds) {
              k.destroy(bud.obj)
              buds.splice(i, 1)
            }
            continue
          }

          if (
            phase === 'running'
            && overlaps(
              playerBox.x, playerBox.y, playerBox.w, playerBox.h,
              bud.x - COGOLLO_HIT.w / 2, bud.y - COGOLLO_HIT.h / 2, COGOLLO_HIT.w, COGOLLO_HIT.h,
            )
          ) {
            takeBud(bud)
          } else if (bud.x < -COGOLLO_W * 2) {
            k.destroy(bud.obj)
            buds.splice(i, 1)
          }
        }

        for (let i = popups.length - 1; i >= 0; i -= 1) {
          const popup = popups[i]!
          popup.life += dt
          const progress = popup.life / PUNTOS_SECONDS
          popup.x -= worldStep
          popup.y -= (PUNTOS_RISE / PUNTOS_SECONDS) * dt

          popup.objs.forEach((obj, index) => {
            obj.pos.x = popup.x + index * PUNTOS_ADVANCE
            obj.pos.y = popup.y
            obj.opacity = Math.max(0, 1 - progress * progress)
          })

          if (progress >= 1) {
            popup.objs.forEach((obj) => k.destroy(obj))
            popups.splice(i, 1)
          }
        }

        if (score !== reportedScore) {
          reportedScore = score
          context.onScoreChange(score)
        }
      })
    })

    return () => {
      disposed = true
    }
  },
})
