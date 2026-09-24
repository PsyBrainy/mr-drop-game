import { describe, expect, it } from 'vitest'
import { DODGE, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT } from '../../../fight/sim/input'
import { ACTION_BUTTONS, readStick, STICK_DEADZONE, STICK_JUMP } from '../fightTouch'

/**
 * Los controles táctiles son DOM y no se montan en Vitest; se prueba lo que
 * decide qué bit marca cada toque. El resto es dónde se escucha el dedo.
 * La y del stick crece hacia abajo, como en la pantalla: arriba es negativo.
 */
const R = 100

describe('el stick', () => {
  it('izquierda y derecha según hacia dónde empujás', () => {
    expect(readStick(-80, 0, R).input).toBe(LEFT)
    expect(readStick(80, 0, R).input).toBe(RIGHT)
  })

  it('cerca del centro no hace nada: apoyar el pulgar no mueve', () => {
    expect(readStick(0, 0, R).input).toBe(NONE)
    expect(readStick(R * STICK_DEADZONE * 0.9, 0, R).input).toBe(NONE)
    expect(readStick(-R * STICK_DEADZONE * 0.9, 0, R).input).toBe(NONE)
  })

  it('para arriba salta', () => {
    expect(readStick(0, -90, R).input).toBe(JUMP)
  })

  it('arriba en diagonal es saltar hacia ese lado', () => {
    expect(readStick(70, -70, R).input).toBe(JUMP | RIGHT)
    expect(readStick(-70, -70, R).input).toBe(JUMP | LEFT)
  })

  it('caminar con el pulgar un poco torcido hacia arriba no salta', () => {
    // Un empuje por debajo del umbral de salto, aunque ya camine.
    const walking = readStick(90, -R * STICK_JUMP * 0.8, R)
    expect(walking.input).toBe(RIGHT)
    expect(STICK_JUMP).toBeGreaterThan(STICK_DEADZONE)
  })

  it('para abajo no hace nada: la sim no lo usa', () => {
    expect(readStick(0, 100, R).input).toBe(NONE)
    expect(readStick(-60, 60, R).input).toBe(LEFT)
  })

  it('la palanca no se sale del aro aunque el dedo sí', () => {
    const far = readStick(300, -400, R)
    expect(Math.hypot(far.knobX, far.knobY)).toBeCloseTo(R)
    // Y conserva la dirección del dedo.
    expect(far.knobX / far.knobY).toBeCloseTo(300 / -400)
    expect(far.input).toBe(JUMP | RIGHT)
  })

  it('adentro del aro sigue al dedo tal cual', () => {
    expect(readStick(20, -30, R)).toMatchObject({ knobX: 20, knobY: -30 })
  })
})

describe('los botones', () => {
  it('son los golpes y el esquive; saltar es del stick', () => {
    const bits = ACTION_BUTTONS.map((button) => button.bit)
    expect(bits).toHaveLength(3)
    expect(new Set(bits)).toEqual(new Set([LIGHT, HEAVY, DODGE]))
  })

  it('ningún botón marca movimiento ni salto', () => {
    for (const button of ACTION_BUTTONS) {
      expect(button.bit & (LEFT | RIGHT | JUMP)).toBe(0)
    }
  })
})
