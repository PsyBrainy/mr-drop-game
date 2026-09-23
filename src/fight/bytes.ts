/**
 * Bytes a texto hexadecimal. Lo comparten el formato de replay y el protocolo de
 * red: un input es un byte, y dos dígitos hex por frame es lo más chico que se
 * puede mandar sin dejar de poder leerlo a ojo en un log o pegarlo en un test.
 */

export function byteToHex(value: number): string {
  return (value & 0xff).toString(16).padStart(2, '0')
}

export function bytesToHex(values: readonly number[]): string {
  return values.map(byteToHex).join('')
}

export function hexToByte(text: string, at: number): number {
  const byte = Number.parseInt(text.slice(at, at + 2), 16)
  if (!Number.isInteger(byte)) throw new Error(`byte ilegible en la posición ${at}`)
  return byte
}

export function hexToBytes(text: string): number[] {
  if (text.length % 2 !== 0) {
    throw new Error(`un hex de bytes tiene que tener largo par y tiene ${text.length}`)
  }
  const bytes: number[] = []
  for (let at = 0; at < text.length; at += 2) bytes.push(hexToByte(text, at))
  return bytes
}
