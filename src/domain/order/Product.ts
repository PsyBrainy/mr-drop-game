export interface Product {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly price: number
  readonly isActive: boolean
  readonly position: number
}

const priceFormat = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export function formatPrice(value: number): string {
  return priceFormat.format(value)
}
