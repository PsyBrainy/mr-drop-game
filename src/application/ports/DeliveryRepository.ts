import type { DeliverySettings } from '../../domain/order/Delivery'

export interface DeliveryRepository {
  get(): Promise<DeliverySettings>
  /** Solo admin. */
  update(settings: DeliverySettings): Promise<DeliverySettings>
}
