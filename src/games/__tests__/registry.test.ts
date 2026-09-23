import { describe, expect, it } from 'vitest'
import { implementedSlugs, isGameImplemented } from '../registry'

describe('registry de juegos', () => {
  it('la pelea local existe sólo para el banco de pruebas', () => {
    // Se juega de a dos en un solo teclado, no da puntaje y no hay ranking que
    // le sirva: ofrecerla en un concurso no tendría sentido.
    expect(implementedSlugs()).toContain('fight-local')
    expect(isGameImplemented('fight-local')).toBe(false)
  })

  it('la pelea online tampoco entra a un concurso todavía', () => {
    // Anda y se juega, pero el resultado no se puede puntuar ni rankear: un
    // concurso que la ofreciera hoy no tendría con qué armar la tabla.
    expect(implementedSlugs()).toContain('fight-online')
    expect(isGameImplemented('fight-online')).toBe(false)
  })

  it('los juegos de concurso sí se pueden ofrecer', () => {
    expect(isGameImplemented('mrdrop-run')).toBe(true)
  })

  it('un slug que no existe no es jugable en ningún lado', () => {
    expect(isGameImplemented('no-existe')).toBe(false)
  })
})
