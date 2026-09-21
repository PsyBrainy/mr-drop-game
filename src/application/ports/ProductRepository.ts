import type { Product } from '../../domain/order/Product'

export interface ProductDraft {
  name: string
  description: string
  price: number
}

export interface ProductRepository {
  /** Solo activos para jugadores; el admin ve todos por RLS. */
  list(): Promise<Product[]>
  create(draft: ProductDraft): Promise<Product>
  update(id: string, patch: Partial<ProductDraft & { isActive: boolean }>): Promise<Product>
  delete(id: string): Promise<void>
}
