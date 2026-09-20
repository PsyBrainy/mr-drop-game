import { AccessCode } from '../../domain/access/AccessCode'
import type { ParticipationRepository, RedeemResult } from '../ports/ParticipationRepository'

/**
 * Canjear un código es la única puerta de entrada a un concurso.
 * El formato se valida acá (dominio); la vigencia y el cupo, en el backend.
 */
export class RedeemAccessCode {
  constructor(private readonly participations: ParticipationRepository) {}

  async execute(rawCode: string): Promise<RedeemResult> {
    const code = AccessCode.create(rawCode)
    return this.participations.redeem(code.value)
  }
}
