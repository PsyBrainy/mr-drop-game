/**
 * Cuánta VRAM ocupan de verdad las imágenes de una instancia de Kaplay.
 *
 * Kaplay (3001) no sube cada PNG a su propia textura: los mete en un atlas de
 * páginas de 2048×2048, en estantes (de izquierda a derecha, y cuando no entra
 * baja al estante siguiente; cuando no entra en la página, abre otra). Cada
 * página es una textura entera de 16 MB aunque tenga un solo sprite adentro.
 * Sólo lo que no entra en una página va suelto, con su tamaño.
 *
 * Por eso sumar ancho × alto × 4 de cada PNG miente: con las hojas del rasta a
 * 2x la suma daba 17 MB y la cuenta real eran 3 páginas, 48 MB (más los 16 del
 * atlas de la fuente). Esta función repite el algoritmo de `TexPacker.add` para
 * que los tests midan lo que paga el teléfono.
 *
 * Es una copia del comportamiento de una versión concreta de Kaplay: si se
 * actualiza Kaplay, hay que revisar que empaquete igual.
 */

export const ATLAS_PAGE_PX = 2048
const BYTES_PER_PIXEL = 4

export interface ImageSize {
  readonly width: number
  readonly height: number
}

export interface AtlasUse {
  /** Páginas del atlas que se abren. */
  readonly pages: number
  /** Imágenes que no entraban en una página y fueron a una textura propia. */
  readonly loose: number
  /** VRAM total en MB: páginas enteras más las sueltas. */
  readonly megabytes: number
}

/** Empaqueta en este orden, como `TexPacker.add` con padding 0 (el default). */
export function atlasUse(images: readonly ImageSize[], page = ATLAS_PAGE_PX): AtlasUse {
  let pages = 1
  let loose = 0
  let looseBytes = 0
  let x = 0
  let y = 0
  let shelf = 0

  for (const { width, height } of images) {
    if (width > page || height > page) {
      loose += 1
      looseBytes += width * height * BYTES_PER_PIXEL
      continue
    }
    if (x + width > page) {
      x = 0
      y += shelf
      shelf = 0
    }
    if (y + height > page) {
      pages += 1
      x = 0
      y = 0
      shelf = 0
    }
    x += width
    shelf = Math.max(shelf, height)
  }

  const pageBytes = page * page * BYTES_PER_PIXEL
  return { pages, loose, megabytes: (pages * pageBytes + looseBytes) / 1024 / 1024 }
}

/**
 * El peor de varios órdenes. El orden de verdad es en el que TERMINAN de bajar
 * las imágenes, que depende de la red, así que un test no puede fijarlo: prueba
 * el orden en que se piden, el inverso y ordenadas por alto (a los dos lados).
 */
export function worstAtlasUse(images: readonly ImageSize[], page = ATLAS_PAGE_PX): AtlasUse {
  const orders = [
    images,
    [...images].reverse(),
    [...images].sort((a, b) => a.height - b.height),
    [...images].sort((a, b) => b.height - a.height),
  ]
  return orders.map((order) => atlasUse(order, page)).reduce((worst, use) => (use.megabytes > worst.megabytes ? use : worst))
}
