import { describe, expect, it } from 'vitest'
import { P1_KEYS } from '../fightControls'
import { CONTROL_HELP, keyLabel } from '../fightHelp'

/** El cartel tiene que decir la verdad: las teclas que muestra son las que andan. */
describe('el cartel de controles', () => {
  it('el teclado es flechas y Z X C', () => {
    const keys = CONTROL_HELP.keyboard.flatMap((row) => row.keys)
    expect(keys).toEqual(expect.arrayContaining(['←', '→', '↑', '↓', 'Z', 'X', 'C']))
    expect(P1_KEYS.JUMP).toBe('ArrowUp')
    expect([P1_KEYS.LIGHT, P1_KEYS.HEAVY, P1_KEYS.DODGE]).toEqual(['KeyZ', 'KeyX', 'KeyC'])
  })

  it('cada forma de jugar explica saltar, los golpes y el esquive', () => {
    for (const rows of Object.values(CONTROL_HELP)) {
      const text = rows.map((row) => `${row.keys.join(' ')} ${row.action}`).join(' ').toLowerCase()
      for (const word of ['salt', 'rápido', 'fuerte', 'esquiv']) expect(text).toContain(word)
    }
  })

  it('las teclas se muestran legibles', () => {
    expect(keyLabel('ArrowLeft')).toBe('←')
    expect(keyLabel('KeyZ')).toBe('Z')
  })
})
