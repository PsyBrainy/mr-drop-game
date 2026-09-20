const KEY = 'mrdrop:pending-code'

/** El código sobrevive al rodeo por login: link -> registro -> canje automático. */
export const pendingCode = {
  save(code: string) {
    try {
      sessionStorage.setItem(KEY, code)
    } catch {
      /* modo privado o storage bloqueado: seguimos sin persistir */
    }
  },
  read(): string | null {
    try {
      return sessionStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
  },
}
