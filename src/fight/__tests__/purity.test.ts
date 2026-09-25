import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Las reglas de determinismo de docs/pelea/reglas.md, verificadas a máquina.
 *
 * La sim de pelea tiene que producir el MISMO estado bit a bit en dos
 * navegadores distintos y en Node (que es donde se re-simula el log de inputs
 * para validar el resultado de un match antes de escribir el ranking). Un
 * `Math.random()` o un `Date.now()` perdido adentro de la sim no se ve: el juego
 * anda, y lo que aparece semanas después son desyncs que no se pueden
 * reproducir. Por eso es un test y no un párrafo en un README.
 *
 * Si se agrega una regla a docs/pelea/reglas.md, se agrega acá. Si algo la tiene que
 * violar, se cambia la regla en el documento — no se hace la excepción suelta.
 */

/** Carpetas que tienen que quedar puras. El resto de `src/fight` (net, replay) habla con el mundo. */
const PURE_DIRS = ['src/fight/sim', 'src/fight/data']

interface Rule {
  pattern: RegExp
  why: string
}

const FORBIDDEN: readonly Rule[] = [
  {
    pattern: /\bMath\.random\b/,
    why: 'la aleatoriedad va por rng.ts con la semilla que fija el servidor',
  },
  {
    // IEEE754 garantiza + - * / y sqrt exactos entre plataformas; las
    // transcendentales las implementa cada motor como quiere y difieren en el
    // último bit. Ese bit, multiplicado por 60 ticks, es un desync.
    pattern: /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|pow|exp|expm1|log|log2|log10|log1p|hypot|cbrt|sinh|cosh|tanh)\b/,
    why: 'las funciones transcendentales no son reproducibles entre motores: usar tabla de lookup en punto fijo',
  },
  {
    pattern: /\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/,
    why: 'el tiempo en la sim es el número de tick, nada más',
  },
  {
    pattern: /\b(document|window|requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|navigator)\b/,
    why: 'la sim corre headless en Node: no existe el navegador',
  },
  {
    pattern: /\bconsole\./,
    why: 'un log por tick a 60 Hz es ruido; para inspeccionar estado hay hash.ts y los replays',
  },
]

/**
 * Los comentarios de la sim van a nombrar justamente lo que está prohibido
 * ("no usar Math.sin acá"), así que escanear el archivo crudo daría falsos
 * positivos en la documentación, que es donde más se necesita nombrar las cosas.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/**
 * Los strings se vacían sólo para buscar APIs prohibidas: un `'Math.random'`
 * suelto en un mensaje de error no es una llamada. Los imports NO se buscan
 * sobre esto — vaciar los strings se lleva puesto el nombre del módulo.
 */
function withoutStrings(source: string): string {
  return source
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function importsOf(source: string): string[] {
  const found: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1] as string)
  }
  return found
}

/**
 * Zod es la única dependencia tolerada, y sólo en `data`: valida el frame data
 * una vez al cargar el personaje, fuera del tick. Un personaje mal escrito
 * tiene que fallar al arrancar y no en medio de un match.
 */
function importAllowed(file: string, specifier: string): boolean {
  if (specifier === 'zod') return file.startsWith('src/fight/data/')
  if (!specifier.startsWith('.')) return false
  const resolved = posix.normalize(posix.join(posix.dirname(file), specifier))
  return PURE_DIRS.some((dir) => resolved.startsWith(`${dir}/`))
}

function violations(file: string, source: string): string[] {
  const bare = withoutComments(source)
  const found: string[] = []

  for (const rule of FORBIDDEN) {
    const match = withoutStrings(bare).match(rule.pattern)
    if (match) found.push(`${match[0]}: ${rule.why}`)
  }

  for (const specifier of importsOf(bare)) {
    if (!importAllowed(file, specifier)) {
      found.push(`import "${specifier}": la sim no importa nada de afuera de sim/ y data/`)
    }
  }

  return found
}

function tsFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const path = posix.join(dir, entry)
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : tsFilesIn(path)
    }
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

const pureFiles = PURE_DIRS.flatMap(tsFilesIn)

describe('el detector', () => {
  /**
   * Mientras la sim esté vacía, el barrido de abajo pasa sin mirar nada. Este
   * caso es el que sostiene el test: verifica que el detector detecta, así que
   * el día que aparezca el primer archivo la red ya está probada y no es un
   * verde vacío que nadie revisó.
   */
  const dirty = [
    "import kaplay from 'kaplay'",
    "import { thing } from '../../ui/lib/layout'",
    'export function step() {',
    '  const angle = Math.sin(Date.now())',
    '  return Math.random() * angle',
    '}',
  ].join('\n')

  it('caza todo lo prohibido en un archivo sucio', () => {
    const found = violations('src/fight/sim/tick.ts', dirty).join('\n')

    expect(found).toContain('Math.sin')
    expect(found).toContain('Date.now')
    expect(found).toContain('Math.random')
    expect(found).toContain('import "kaplay"')
    expect(found).toContain('import "../../ui/lib/layout"')
  })

  it('no se queja de los comentarios que nombran lo prohibido', () => {
    const documented = [
      '/** Nada de Math.sin acá: no es reproducible entre motores. */',
      "// Tampoco Date.now() ni Math.random().",
      "import { fx } from './fixed'",
      'export const ZERO = fx(0)',
    ].join('\n')

    expect(violations('src/fight/sim/state.ts', documented)).toEqual([])
  })

  it('deja pasar a zod en data/ y lo rechaza en sim/', () => {
    const source = "import { z } from 'zod'"

    expect(violations('src/fight/data/schema.ts', source)).toEqual([])
    expect(violations('src/fight/sim/tick.ts', source)).toHaveLength(1)
  })
})

describe('la sim de pelea es pura', () => {
  /**
   * Un solo caso en vez de uno por archivo: con la sim todavía vacía
   * (`it.each([])`) Vitest reporta el suite como error por no tener ningún
   * test, y en M0 no haber archivos es el estado correcto, no una falla. El
   * detalle por archivo no se pierde: cada hallazgo entra a la lista con su
   * ruta adelante.
   */
  it('ningún archivo rompe una regla de determinismo', () => {
    const found = pureFiles.flatMap((file) =>
      violations(file, readFileSync(file, 'utf8')).map((problem) => `${file} → ${problem}`),
    )

    expect(found).toEqual([])
  })

  /**
   * Lo que sí no puede pasar es que una carpeta exista y esté vacía: eso
   * significa que la sim se movió de lugar y el barrido quedó apuntando al aire.
   */
  it.each(PURE_DIRS.filter(existsSync))('%s tiene código para revisar', (dir) => {
    expect(tsFilesIn(dir).length).toBeGreaterThan(0)
  })
})
