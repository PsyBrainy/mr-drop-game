import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import contract from '../order/orderFlow.contract.json'
import { COURIER_TRANSITIONS, courierCanMove, courierNextStatuses } from '../order/OrderFlow'
import { ORDER_STATUS_LABEL, type OrderStatus } from '../order/Order'
import { isDomainErrorCode } from '../shared/DomainError'

/**
 * El flujo del reparto está escrito tres veces: en la base (0012 / 0013), en
 * OrderFlow.ts y en orderFlow.contract.json, que es lo que lee la app Android.
 * Este test es lo único que impide que se separen en silencio. No verifica
 * que el flujo sea "bueno": verifica que los tres digan lo mismo.
 */

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))
const allSql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(MIGRATIONS + f, 'utf8'))
  .join('\n')

const key = (t: { from: string; to: string }) => `${t.from}->${t.to}`

describe('contrato del reparto', () => {
  it('los estados del contrato son los del dominio', () => {
    expect([...contract.statuses].sort()).toEqual(Object.keys(ORDER_STATUS_LABEL).sort())
  })

  it('los estados del contrato son los del enum de la base', () => {
    const created = allSql.match(/create type public\.order_status as enum \(([^)]*)\)/)?.[1] ?? ''
    const added = [...allSql.matchAll(/alter type public\.order_status add value if not exists '(\w+)'/g)].map((m) => m[1])
    const inDb = [...created.matchAll(/'(\w+)'/g)].map((m) => m[1]).concat(added)
    expect(inDb.sort()).toEqual([...contract.statuses].sort())
  })

  it('las transiciones del dominio son las del contrato', () => {
    expect(COURIER_TRANSITIONS.map((t) => `${key(t)} via ${t.via}`).sort()).toEqual(
      contract.courierTransitions.map((t) => `${key(t)} via ${t.via}`).sort(),
    )
  })

  it('las transiciones de courier_transition_allowed() son las del contrato', () => {
    const block = allSql.match(/-- contrato:inicio([\s\S]*?)-- contrato:fin/)?.[1]
    expect(block, 'faltan los marcadores del contrato en la migración').toBeDefined()
    const inDb = [...(block ?? '').matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}->${m[2]}`)
    expect(inDb.sort()).toEqual(contract.courierTransitions.map(key).sort())
  })

  it('cada error del contrato existe en el dominio y la base lo levanta con ese código', () => {
    for (const [code, sqlstate] of Object.entries(contract.errors)) {
      expect(isDomainErrorCode(code), `${code} no está en DomainError`).toBe(true)
      expect(allSql, `${code} no se levanta con ${sqlstate}`).toContain(`raise exception '${code}' using errcode = '${sqlstate}'`)
    }
  })

  it('cada función del contrato existe en la base con esos parámetros', () => {
    for (const [fn, params] of Object.entries(contract.rpc)) {
      const signature = allSql.match(new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)`))?.[1]
      expect(signature, `falta ${fn}`).toBeDefined()
      for (const param of Object.keys(params)) expect(signature, `${fn} sin ${param}`).toContain(param)
    }
  })
})

describe('flujo del repartidor', () => {
  it('no se saltea la salida: de asignado no se entrega', () => {
    expect(courierCanMove('assigned', 'delivered')).toBe(false)
    expect(courierCanMove('pending', 'on_the_way')).toBe(false)
  })

  it('lo terminado no lo mueve el repartidor (eso es corrección del admin)', () => {
    for (const status of ['delivered', 'failed', 'cancelled'] as OrderStatus[]) {
      expect(courierNextStatuses(status)).toEqual([])
    }
  })

  it('el repartidor nunca cancela: eso es del usuario o del admin', () => {
    expect(COURIER_TRANSITIONS.some((t) => t.to === 'cancelled')).toBe(false)
  })

  it('desde la bolsa se puede llegar a entregado', () => {
    const reached = new Set<OrderStatus>(['pending'])
    for (let changed = true; changed; ) {
      changed = false
      for (const t of COURIER_TRANSITIONS) {
        if (reached.has(t.from) && !reached.has(t.to)) {
          reached.add(t.to)
          changed = true
        }
      }
    }
    expect(reached.has('delivered')).toBe(true)
  })
})
