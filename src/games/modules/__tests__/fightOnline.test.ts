import { describe, expect, it } from 'vitest'
import { BOT_LEVEL_ORDER } from '../../../fight/bot/bot'
import { BOT_NAME, botDisplayName, botEndingMessage, botLevelFromConfig, endingMessage, eventGameIdFrom, fightResult } from '../fightOnline'

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

describe('la pelea contra el bot', () => {
  it('el cartel del final dice que fue contra la máquina, ganes o pierdas', () => {
    // Nadie tiene que irse creyendo que le ganó a una persona.
    expect(botEndingMessage(0)).toContain('máquina')
    expect(botEndingMessage(1)).toContain('máquina')
    expect(botEndingMessage(null)).toContain('máquina')
    expect(botEndingMessage(0)).not.toBe(botEndingMessage(1))
  })

  it('el bot tiene nombre de bot', () => {
    expect(BOT_NAME.toLowerCase()).toContain('bot')
  })
})

describe('el nombre del bot', () => {
  it('dice el nivel, y cada nivel se llama distinto', () => {
    expect(botDisplayName('easy')).toBe(`${BOT_NAME} · Fácil`)
    expect(botDisplayName('hard')).toBe(`${BOT_NAME} · Difícil`)
    const names = BOT_LEVEL_ORDER.map(botDisplayName)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name.toLowerCase()).toContain('bot')
  })
})

describe('pedir la pelea directo contra la máquina', () => {
  it('lee el nivel de la config', () => {
    expect(botLevelFromConfig({ vsBot: 'hard' })).toBe('hard')
    expect(botLevelFromConfig({ vsBot: 'easy', otra: 1 })).toBe('easy')
  })

  it('sin nivel, o con cualquier otra cosa, es la pelea online', () => {
    expect(botLevelFromConfig({})).toBeNull()
    expect(botLevelFromConfig({ vsBot: 'imposible' })).toBeNull()
    expect(botLevelFromConfig({ vsBot: true })).toBeNull()
  })
})

describe('desde qué concurso se pelea', () => {
  it('lee el juego del concurso de la config', () => {
    expect(eventGameIdFrom({ eventGameId: 'eg-1' })).toBe('eg-1')
  })

  it('sin concurso (el sandbox) no hay', () => {
    expect(eventGameIdFrom({})).toBeUndefined()
    expect(eventGameIdFrom({ eventGameId: '' })).toBeUndefined()
    expect(eventGameIdFrom({ eventGameId: 7 })).toBeUndefined()
  })
})

describe('el resultado para Analytics', () => {
  it('desde el lugar de cada uno', () => {
    expect(fightResult('result', 0, 0)).toBe('win')
    expect(fightResult('result', 0, 1)).toBe('lose')
    expect(fightResult('result', null, 1)).toBe('draw')
    expect(fightResult('forfeit', 1, 1)).toBe('win_rival_left')
    expect(fightResult('forfeit', 1, 0)).toBe('lose_left')
    expect(fightResult('desync', null, 0)).toBe('desync')
  })
})
