/** Error de negocio: conocido, esperable y mostrable al usuario. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export type DomainErrorCode =
  | 'AUTH_REQUIRED'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'CODE_EXHAUSTED'
  | 'EVENT_CLOSED'
  | 'GAME_DISABLED'
  | 'GAME_NOT_IMPLEMENTED'
  | 'NOT_PARTICIPANT'
  | 'NO_PLAYS_LEFT'
  | 'SESSION_CLOSED'
  | 'SESSION_NOT_FOUND'
  | 'ORDERS_CLOSED'
  | 'ROUND_CODE_REQUIRED'
  | 'ROUND_ALREADY_OPEN'
  | 'ADDRESS_REQUIRED'
  | 'ORDER_EMPTY'
  | 'ORDER_DELIVERED'
  | 'PRODUCT_UNAVAILABLE'
  | 'UNEXPECTED'

const MESSAGES: Record<DomainErrorCode, string> = {
  AUTH_REQUIRED: 'Necesitás iniciar sesión para participar.',
  CODE_INVALID: 'Ese código no existe o ya no está activo.',
  CODE_EXPIRED: 'Ese código venció.',
  CODE_EXHAUSTED: 'Ese código ya llegó a su límite de usos.',
  EVENT_CLOSED: 'El concurso no está abierto en este momento.',
  GAME_DISABLED: 'Ese juego no está habilitado ahora.',
  GAME_NOT_IMPLEMENTED: 'Ese juego todavía no está disponible en esta versión.',
  NOT_PARTICIPANT: 'Primero tenés que entrar al concurso con tu código.',
  NO_PLAYS_LEFT: 'Ya usaste todos tus intentos en este juego.',
  SESSION_CLOSED: 'Esa partida ya estaba cerrada.',
  SESSION_NOT_FOUND: 'No encontramos esa partida.',
  ORDERS_CLOSED: 'Los pedidos están cerrados en este momento.',
  ROUND_CODE_REQUIRED: 'Primero tenés que ingresar el código de esta camada de pedidos.',
  ROUND_ALREADY_OPEN: 'Ya hay una camada de pedidos abierta. Cerrala antes de abrir otra.',
  ADDRESS_REQUIRED: 'Cargá tu dirección en Mi cuenta antes de pedir.',
  ORDER_EMPTY: 'Elegí al menos un combo para hacer el pedido.',
  ORDER_DELIVERED: 'Ese pedido ya fue entregado y no se puede cambiar.',
  PRODUCT_UNAVAILABLE: 'Uno de los combos ya no está disponible. Revisá tu pedido.',
  UNEXPECTED: 'Algo salió mal. Probá de nuevo en un momento.',
}

export function domainError(code: DomainErrorCode, detail?: string): DomainError {
  return new DomainError(code, detail ?? MESSAGES[code])
}

export function messageFor(code: DomainErrorCode): string {
  return MESSAGES[code]
}

export function isDomainErrorCode(value: unknown): value is DomainErrorCode {
  return typeof value === 'string' && value in MESSAGES
}
