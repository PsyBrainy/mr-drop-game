export interface RedeemResult {
  eventId: string
  eventSlug: string
  eventName: string
  alreadyJoined: boolean
}

export interface ParticipationRepository {
  /** Canjea el código contra el backend. Lanza DomainError si no aplica. */
  redeem(code: string): Promise<RedeemResult>
  isParticipant(eventId: string): Promise<boolean>
  listMyEventIds(): Promise<string[]>
}
