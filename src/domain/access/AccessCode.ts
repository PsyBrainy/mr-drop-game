import { domainError } from '../shared/DomainError'

const PATTERN = /^[A-Z0-9-]{4,32}$/

/**
 * Value Object del código de acceso a un concurso.
 * Normaliza (mayúsculas, sin espacios) y garantiza el formato antes de salir del dominio.
 */
export class AccessCode {
  private constructor(readonly value: string) {
    Object.freeze(this)
  }

  static normalize(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, '')
  }

  static isValid(raw: string): boolean {
    return PATTERN.test(AccessCode.normalize(raw))
  }

  /** @throws DomainError CODE_INVALID */
  static create(raw: string): AccessCode {
    const normalized = AccessCode.normalize(raw)
    if (!PATTERN.test(normalized)) {
      throw domainError('CODE_INVALID', 'El código tiene entre 4 y 32 letras, números o guiones.')
    }
    return new AccessCode(normalized)
  }

  equals(other: AccessCode): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
