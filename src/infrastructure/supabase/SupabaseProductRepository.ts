import type { ProductDraft, ProductRepository } from '../../application/ports/ProductRepository'
import type { Product } from '../../domain/order/Product'
import { getSupabase } from './client'
import { translateError, unwrap } from './errors'
import { toProduct } from './mappers'
import type { ProductRow } from './rows'

const COLUMNS = 'id, name, description, price, is_active, position'

export class SupabaseProductRepository implements ProductRepository {
  async list(): Promise<Product[]> {
    const result = await getSupabase()
      .from('products')
      .select(COLUMNS)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<ProductRow[]>()
    return unwrap(result).map(toProduct)
  }

  async create(draft: ProductDraft): Promise<Product> {
    const result = await getSupabase()
      .from('products')
      .insert({ name: draft.name, description: draft.description, price: draft.price })
      .select(COLUMNS)
      .single<ProductRow>()
    return toProduct(unwrap(result))
  }

  async update(id: string, patch: Partial<ProductDraft & { isActive: boolean }>): Promise<Product> {
    const result = await getSupabase()
      .from('products')
      .update({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.price !== undefined && { price: patch.price }),
        ...(patch.isActive !== undefined && { is_active: patch.isActive }),
      })
      .eq('id', id)
      .select(COLUMNS)
      .single<ProductRow>()
    return toProduct(unwrap(result))
  }

  async delete(id: string): Promise<void> {
    const { error } = await getSupabase().from('products').delete().eq('id', id)
    if (error) throw translateError(error)
  }
}
