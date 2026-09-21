import type { DeliveryRepository } from '../../application/ports/DeliveryRepository'
import type { DeliverySettings } from '../../domain/order/Delivery'
import { getSupabase } from './client'
import { unwrap } from './errors'
import { toDeliverySettings } from './mappers'
import type { DeliverySettingsRow } from './rows'

const COLUMNS = 'fee_inside, fee_outside, zone'

export class SupabaseDeliveryRepository implements DeliveryRepository {
  async get(): Promise<DeliverySettings> {
    const result = await getSupabase()
      .from('delivery_settings')
      .select(COLUMNS)
      .eq('id', true)
      .single<DeliverySettingsRow>()
    return toDeliverySettings(unwrap(result))
  }

  async update(settings: DeliverySettings): Promise<DeliverySettings> {
    const result = await getSupabase()
      .from('delivery_settings')
      .update({
        fee_inside: settings.feeInside,
        fee_outside: settings.feeOutside,
        zone: settings.zone.map((point) => ({ lat: point.lat, lng: point.lng })),
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
      .select(COLUMNS)
      .single<DeliverySettingsRow>()
    return toDeliverySettings(unwrap(result))
  }
}
