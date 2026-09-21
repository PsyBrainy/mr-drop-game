import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Pinta el botón de confirmar en rojo. */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface Pending extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise((resolve) => {
        setPending((current) => {
          current?.resolve(false)
          return { ...options, resolve }
        })
      }),
    [],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (pending && !dialog.open) dialog.showModal()
    if (!pending && dialog.open) dialog.close()
  }, [pending])

  const settle = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        className="confirm"
        onCancel={(event) => {
          event.preventDefault()
          settle(false)
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) settle(false)
        }}
      >
        {pending && (
          <div className="confirm__box stack">
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{pending.title}</h2>
            {pending.message && <p className="muted" style={{ margin: 0 }}>{pending.message}</p>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Volver'}
              </button>
              <button
                type="button"
                className={`btn ${pending.danger ? 'btn--danger' : ''}`}
                autoFocus
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return confirm
}
