import { describe, expect, it } from 'vitest'
import { endingMessage } from '../fightOnline'

/**
 * El final importa tanto como la pelea: no es lo mismo perder que quedarse sin
 * rival, y no es lo mismo perder que una partida que no cuenta. El mensaje es
 * lo único que el jugador se lleva, así que tiene que decir la verdad.
 */
describe('el cartel del final', () => {
  it('distingue ganar de perder según el lugar de cada uno', () => {
    expect(endingMessage('result', 0, 0)).toBe('¡Ganaste!')
    expect(endingMessage('result', 1, 0)).toBe('Perdiste')
    expect(endingMessage('result', 1, 1)).toBe('¡Ganaste!')
  })

  it('un resultado sin ganador es empate', () => {
    expect(endingMessage('result', null, 0)).toBe('¡Empate!')
  })

  it('no dice que ganaste cuando el otro se fue', () => {
    // Ganar porque el rival se fue no es lo mismo que ganar peleando, y el
    // cartel lo dice: si no, parece que la pelea se ganó en la cancha.
    expect(endingMessage('forfeit', 0, 0)).toContain('se fue')
    expect(endingMessage('forfeit', 0, 1)).toBe('Te fuiste de la pelea')
  })

  it('un desync no le echa la culpa a nadie', () => {
    // Nadie ganó: las dos simulaciones dejaron de coincidir y no hay resultado
    // que valga. Decir "perdiste" sería mentir.
    expect(endingMessage('desync', null, 0)).toContain('dejaron de coincidir')
    expect(endingMessage('disagreement', null, 0)).toContain('no cuenta')
  })
})
