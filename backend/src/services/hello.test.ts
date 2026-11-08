import { describe, it, expect, vi, beforeEach } from 'vitest'

const serverTimestamp = { sentinel: 'serverTimestamp' }
const runTransaction = vi.fn()
const doc = vi.fn((path: string) => ({ path }))
const collection = vi.fn((name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection, doc, runTransaction }),
  FieldValue: { serverTimestamp: () => serverTimestamp },
}))

import { recordVisit } from './hello'

function fakeTx(existing: { visits: number } | null) {
  return {
    get: vi.fn(async () => ({ exists: existing !== null, data: () => existing })),
    set: vi.fn(),
  }
}

describe('recordVisit', () => {
  beforeEach(() => {
    runTransaction.mockReset()
  })

  it('returns 1 and creates the doc on first visit', async () => {
    const tx = fakeTx(null)
    runTransaction.mockImplementation(async (fn) => fn(tx))

    expect(await recordVisit()).toBe(1)
    expect(tx.get).toHaveBeenCalledWith({ path: 'meta/hello' })
    expect(tx.set).toHaveBeenCalledWith(
      { path: 'meta/hello' },
      { visits: 1, updatedAt: serverTimestamp }
    )
  })

  it('increments an existing count', async () => {
    const tx = fakeTx({ visits: 4 })
    runTransaction.mockImplementation(async (fn) => fn(tx))

    expect(await recordVisit()).toBe(5)
    expect(tx.get).toHaveBeenCalledWith({ path: 'meta/hello' })
    expect(tx.set).toHaveBeenCalledWith(
      { path: 'meta/hello' },
      { visits: 5, updatedAt: serverTimestamp }
    )
  })
})
