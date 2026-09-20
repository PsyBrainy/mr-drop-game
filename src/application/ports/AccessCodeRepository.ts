export interface AccessCodeSummary {
  id: string
  code: string
  label: string
  maxUses: number
  usedCount: number
  expiresAt: Date | null
  isActive: boolean
}

export interface AccessCodeDraft {
  eventId: string
  code: string
  label: string
  maxUses: number
  expiresAt: Date | null
}

/** Solo accesible para admin: RLS bloquea estas tablas para jugadores. */
export interface AccessCodeRepository {
  listForEvent(eventId: string): Promise<AccessCodeSummary[]>
  create(draft: AccessCodeDraft): Promise<AccessCodeSummary>
  setActive(id: string, isActive: boolean): Promise<AccessCodeSummary>
}
