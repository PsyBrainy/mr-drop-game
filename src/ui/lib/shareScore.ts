export interface ShareScoreInput {
  score: number
  /** Título del fin de partida (ej. "¡Terminó!"). */
  message: string
  /** Payload que devuelve el juego: obstáculos, cogollos, razón, etc. */
  payload: Record<string, unknown>
  /** Qué se estaba jugando; va al pie de la imagen. */
  modeLabel: string
  /** Link que se invita a abrir. */
  shareUrl: string
}

/**
 * Arma una imagen con el resultado y la comparte con el diálogo nativo
 * (WhatsApp incluido). Si el navegador no soporta compartir archivos,
 * descarga la imagen y abre WhatsApp con el texto.
 */
export async function shareScore(input: ShareScoreInput): Promise<void> {
  const { score, message, payload, modeLabel, shareUrl } = input

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 800
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1e1e2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.textAlign = 'center'

    ctx.font = 'bold 50px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('¡Resultados en Mister Drop!', 400, 120)

    ctx.font = 'bold 160px sans-serif'
    ctx.fillStyle = '#f9ca24'
    ctx.fillText(score.toString(), 400, 320)

    ctx.font = '36px sans-serif'
    ctx.fillStyle = '#ffffff'
    let y = 440

    if (payload.obstaculos !== undefined) {
      ctx.fillText(`🚦 Obstáculos pasados: ${payload.obstaculos}`, 400, y)
      y += 60
    }
    if (payload.cogollos !== undefined) {
      ctx.fillText(`🌿 Cogollos fumados: ${payload.cogollos}`, 400, y)
      y += 60
    }

    ctx.font = '30px sans-serif'
    ctx.fillStyle = '#ff7979'
    let shareReason = message
    if (payload.reason === 'policia') {
      shareReason = 'Se choco a la gorra'
    } else if (payload.reason === 'pozo') {
      shareReason = 'Se comio un pozo'
    }
    ctx.fillText(`💀 Razón: ${shareReason}`, 400, y + 40)

    ctx.font = '24px sans-serif'
    ctx.fillStyle = '#888888'
    ctx.fillText(`${modeLabel} | mrdrop.psybrainy.com`, 400, 740)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return

    const file = new File([blob], 'puntaje.png', { type: 'image/png' })
    const shareText = `¡Acabo de hacer ${score} puntos en Mister Drop!\n¿Te animás a superarme? Jugalo acá: ${shareUrl}`

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Mister Drop - Puntaje',
        text: shareText,
        files: [file],
      })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'puntaje-mrdrop.png'
      a.click()
      URL.revokeObjectURL(url)
      alert('Tu navegador descargó la imagen porque no soporta compartirla directamente. ¡Adjuntala en WhatsApp!')
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank')
    }
  } catch (err) {
    // El usuario canceló el diálogo nativo: no es un error.
    if (err instanceof DOMException && err.name === 'AbortError') return
    console.error('Error al compartir:', err)
    alert('Hubo un error al intentar compartir.')
  }
}
