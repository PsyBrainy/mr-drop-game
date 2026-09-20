export interface Size {
  width: number
  height: number
}

/**
 * El rectángulo más grande con esta relación de aspecto que entra en la caja.
 *
 * Se usa para el juego a pantalla completa. No alcanza con `min(100vw, 100dvh *
 * ar)` en CSS: en mobile el alto del viewport y el alto real del contenedor no
 * coinciden mientras el navegador esconde o muestra su barra, y en un iPhone con
 * muesca el área segura recorta todavía más. Midiendo la caja de verdad el
 * marco nunca se puede pasar, venga de donde venga el tamaño.
 */
export function fitInside(aspectRatio: number, box: Size): Size {
  if (!(aspectRatio > 0) || box.width <= 0 || box.height <= 0) {
    return { width: 0, height: 0 }
  }
  const width = Math.min(box.width, box.height * aspectRatio)
  return { width, height: width / aspectRatio }
}

/** Caja de contenido del elemento: sin bordes ni padding (el área segura). */
export function contentBox(element: HTMLElement): Size {
  const style = getComputedStyle(element)
  return {
    width:
      element.clientWidth
      - parseFloat(style.paddingLeft || '0')
      - parseFloat(style.paddingRight || '0'),
    height:
      element.clientHeight
      - parseFloat(style.paddingTop || '0')
      - parseFloat(style.paddingBottom || '0'),
  }
}
