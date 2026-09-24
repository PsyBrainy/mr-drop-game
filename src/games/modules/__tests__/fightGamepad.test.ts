import { describe, expect, it } from 'vitest'
import { DODGE, DOWN, HEAVY, JUMP, LEFT, LIGHT, NONE, RIGHT } from '../../../fight/sim/input'
import { PAD_DEADZONE, PAD_DOWN, readPad, type PadState } from '../fightGamepad'

/**
 * El mando se prueba con estados inventados: qué bits salen de qué botones y
 * de qué inclinación del stick. Lo de escuchar al navegador no se monta acá.
 */
function pad(pressed: number[] = [], axes: number[] = [0, 0]): PadState {
  return { buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes }
}

describe('el mando', () => {
  it('suelto no hace nada', () => {
    expect(readPad(pad())).toBe(NONE)
  })

  it('los botones: A salta, X rápido, Y y B fuerte, los hombros esquivan', () => {
    expect(readPad(pad([0]))).toBe(JUMP)
    expect(readPad(pad([2]))).toBe(LIGHT)
    expect(readPad(pad([3]))).toBe(HEAVY)
    expect(readPad(pad([1]))).toBe(HEAVY)
    expect(readPad(pad([4]))).toBe(DODGE)
    expect(readPad(pad([5]))).toBe(DODGE)
  })

  it('la cruz camina y baja', () => {
    expect(readPad(pad([14]))).toBe(LEFT)
    expect(readPad(pad([15]))).toBe(RIGHT)
    expect(readPad(pad([13]))).toBe(DOWN)
  })

  it('el stick camina pasando la zona muerta, y no antes', () => {
    expect(readPad(pad([], [-0.9, 0]))).toBe(LEFT)
    expect(readPad(pad([], [0.9, 0]))).toBe(RIGHT)
    expect(readPad(pad([], [PAD_DEADZONE * 0.8, 0]))).toBe(NONE)
  })

  it('para abajo hay que empujar fuerte: caminar torcido no te baja', () => {
    expect(readPad(pad([], [0, 0.95]))).toBe(DOWN)
    expect(readPad(pad([], [0, PAD_DOWN * 0.8]))).toBe(NONE)
  })

  it('stick para arriba no salta: saltar es la A', () => {
    expect(readPad(pad([], [0, -1]))).toBe(NONE)
  })

  it('se combina: caminar, saltar y pegar a la vez', () => {
    expect(readPad(pad([0, 2], [0.8, 0]))).toBe(RIGHT | JUMP | LIGHT)
  })

  it('izquierda y derecha a la vez se anulan', () => {
    expect(readPad(pad([14], [0.9, 0]))).toBe(NONE)
  })

  it('un mando raro con menos botones no rompe', () => {
    expect(readPad({ buttons: [{ pressed: true }], axes: [] })).toBe(JUMP)
  })
})
