import { describe, expect, it } from 'vitest'
import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT } from '../../../fight/sim/input'
import { ACTION_BUTTONS, readStick, STICK_DEADZONE, STICK_DOWN } from '../fightTouch'

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

  it('para arriba no salta: saltar es un botón', () => {
    expect(readStick(0, -90, R).input).toBe(NONE)
    expect(readStick(70, -70, R).input).toBe(RIGHT)
    expect(readStick(-70, -70, R).input).toBe(LEFT)
  })

  it('para abajo, empujando fuerte, baja de la flotante', () => {
    expect(readStick(0, 100, R).input).toBe(DOWN)
    expect(readStick(0, R * STICK_DOWN * 0.8, R).input).toBe(NONE)
    expect(readStick(-60, 60, R).input).toBe(LEFT | DOWN)
    expect(STICK_DOWN).toBeGreaterThan(STICK_DEADZONE)
  })

  it('la palanca no se sale del aro aunque el dedo sí', () => {
    const far = readStick(300, -400, R)
    expect(Math.hypot(far.knobX, far.knobY)).toBeCloseTo(R)
    // Y conserva la dirección del dedo.
    expect(far.knobX / far.knobY).toBeCloseTo(300 / -400)
    expect(far.input).toBe(RIGHT)
  })

  it('adentro del aro sigue al dedo tal cual', () => {
    expect(readStick(20, -30, R)).toMatchObject({ knobX: 20, knobY: -30 })
  })
})

describe('los botones', () => {
  it('son saltar, los dos golpes y el esquive', () => {
    const bits = ACTION_BUTTONS.map((button) => button.bit)
    expect(bits).toHaveLength(4)
    expect(new Set(bits)).toEqual(new Set([JUMP, LIGHT, HEAVY, DODGE]))
  })

  it('ningún botón camina: eso es del stick', () => {
    for (const button of ACTION_BUTTONS) {
      expect(button.bit & (LEFT | RIGHT | DOWN)).toBe(0)
    }
  })
})
