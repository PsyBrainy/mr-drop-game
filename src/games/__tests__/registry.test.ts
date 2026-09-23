import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El registry depende de dos variables de build (`VITE_FIGHT_WS_URL` y
 * `VITE_ENABLE_FIGHT_LOCAL`) que se leen al cargar el módulo. Cada test fija las
 * suyas y carga el registry de cero: así el resultado no depende del `.env` de
 * quien corre los tests.
 */
async function loadRegistry(env: { ws?: string; fightLocal?: string } = {}) {
  vi.resetModules()
  vi.stubEnv('VITE_FIGHT_WS_URL', env.ws ?? '')
  vi.stubEnv('VITE_ENABLE_FIGHT_LOCAL', env.fightLocal ?? '')
  return import('../registry')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('registry de juegos', () => {
  it('la pelea local no existe si no se pide con la variable', async () => {
    // Es una herramienta de ajuste de a dos en un teclado. Sin
    // VITE_ENABLE_FIGHT_LOCAL no aparece en ningún lado, ni en el sandbox.
    const registry = await loadRegistry()
    expect(registry.implementedSlugs()).not.toContain('fight-local')
    expect(registry.isGameImplemented('fight-local')).toBe(false)
  })

  it('con la variable aparece en el sandbox, pero nunca en un concurso', async () => {
    const registry = await loadRegistry({ fightLocal: 'true', ws: 'ws://localhost:8080/ws/fight' })
    expect(registry.implementedSlugs()).toContain('fight-local')
    expect(registry.isGameImplemented('fight-local')).toBe(false)
    expect(registry.unavailableReason('fight-local')).toBe('sólo sandbox')
  })

  it('la pelea online es una pelea: sin puntaje, sin sesión, sin ranking', async () => {
    const registry = await loadRegistry()
    expect(registry.implementedSlugs()).toContain('fight-online')
    expect(registry.gameKind('fight-online')).toBe('match')
    expect(registry.gameKind('mrdrop-run')).toBe('score')
  })

  it('con servidor, la pelea online se puede ofrecer como cualquier juego', async () => {
    const registry = await loadRegistry({ ws: 'wss://pelea.ejemplo.com/ws/fight' })
    expect(registry.isGameImplemented('fight-online')).toBe(true)
    expect(registry.unavailableReason('fight-online')).toBeNull()
  })

  it('sin servidor no se ofrece, y el panel dice por qué', async () => {
    // Es el caso de un deploy sin psy-ws: prender el interruptor no alcanza.
    const registry = await loadRegistry()
    expect(registry.isGameImplemented('fight-online')).toBe(false)
    expect(registry.unavailableReason('fight-online')).toContain('VITE_FIGHT_WS_URL')
  })

  it('los juegos de concurso sí se pueden ofrecer', async () => {
    const registry = await loadRegistry()
    expect(registry.isGameImplemented('mrdrop-run')).toBe(true)
  })

  it('la pelea trae su propio HUD; el resto usa el de puntaje de la app', async () => {
    const registry = await loadRegistry()
    expect(registry.gameHasOwnHud('fight-online')).toBe(true)
    expect(registry.gameHasOwnHud('mrdrop-run')).toBe(false)
  })

  it('un slug que no existe no es jugable en ningún lado', async () => {
    const registry = await loadRegistry()
    expect(registry.isGameImplemented('no-existe')).toBe(false)
    expect(registry.unavailableReason('no-existe')).toBe('sin módulo')
  })
})
