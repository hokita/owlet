import { describe, it, expect, vi, beforeEach } from 'vitest'

const serverTimestamp = { sentinel: 'serverTimestamp' }
const now = { toDate: () => new Date('2026-11-14T01:02:03.000Z') }

const get = vi.fn()
const orderBy = vi.fn(() => ({ get }))
const deleteDoc = vi.fn()
const batch = { set: vi.fn(), commit: vi.fn() }
const tx = { get: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(), create: vi.fn() }

function docRef(path: string) {
  return {
    path,
    id: path.split('/').pop(),
    delete: () => deleteDoc(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  }
}

function collectionRef(path: string) {
  return {
    path,
    orderBy: (field: string, dir: string) => {
      orderBy(path, field, dir)
      return { get }
    },
    doc: (id?: string) => docRef(`${path}/${id ?? 'new-id'}`),
  }
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: collectionRef,
    batch: () => batch,
    runTransaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  }),
  FieldValue: { serverTimestamp: () => serverTimestamp },
  Timestamp: { now: () => now },
}))

import { addNote, deleteNote, listNotes, updateNote } from './reviews'

describe('listNotes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the month notes in creation order', async () => {
    get.mockResolvedValue({
      docs: [
        {
          id: 'n1',
          data: () => ({ type: 'event', text: 'Trip', createdAt: now }),
        },
        {
          id: 'n2',
          data: () => ({ type: 'next', text: 'Read', createdAt: now, source: 'api' }),
        },
      ],
    })

    const notes = await listNotes(2026, 3)

    expect(orderBy).toHaveBeenCalledWith('reviews/2026-03/notes', 'createdAt', 'asc')
    // Notes saved before `source` existed read as 'app'.
    expect(notes).toEqual([
      {
        id: 'n1',
        type: 'event',
        text: 'Trip',
        source: 'app',
        createdAt: '2026-11-14T01:02:03.000Z',
      },
      {
        id: 'n2',
        type: 'next',
        text: 'Read',
        source: 'api',
        createdAt: '2026-11-14T01:02:03.000Z',
      },
    ])
  })
})

describe('addNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes the review and the note in one batch', async () => {
    const note = await addNote(2026, 11, { type: 'learn', text: 'Firestore', source: 'api' })

    expect(batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'reviews/2026-11' }),
      { year: 2026, month: 11, updatedAt: serverTimestamp },
      { merge: true }
    )
    expect(batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'reviews/2026-11/notes/new-id' }),
      { type: 'learn', text: 'Firestore', source: 'api', createdAt: now }
    )
    expect(batch.commit).toHaveBeenCalled()
    expect(note).toEqual({
      id: 'new-id',
      type: 'learn',
      text: 'Firestore',
      source: 'api',
      createdAt: '2026-11-14T01:02:03.000Z',
    })
  })
})

describe('deleteNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the note doc', async () => {
    await deleteNote(2026, 1, 'n9')
    expect(deleteDoc).toHaveBeenCalledWith('reviews/2026-01/notes/n9')
  })
})

describe('updateNote', () => {
  const stored = { type: 'event', text: 'Trip', source: 'api', createdAt: now }
  const path = 'reviews/2026-11/notes/n1'

  // The transaction reads the note by path; only the stored one exists.
  function stubStored(data: Record<string, unknown> | null) {
    tx.get.mockImplementation(async (ref: { path: string }) => ({
      exists: data !== null && ref.path === path,
      data: () => data,
    }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    stubStored(stored)
  })

  it('updates text and type in place', async () => {
    const result = await updateNote(2026, 11, 'n1', { text: 'Trip!', type: 'learn' })

    expect(tx.update).toHaveBeenCalledWith(expect.objectContaining({ path }), {
      text: 'Trip!',
      type: 'learn',
    })
    expect(tx.delete).not.toHaveBeenCalled()
    expect(tx.set).not.toHaveBeenCalled()
    expect(tx.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      year: 2026,
      month: 11,
      note: {
        id: 'n1',
        type: 'learn',
        text: 'Trip!',
        source: 'api',
        createdAt: '2026-11-14T01:02:03.000Z',
      },
    })
  })

  it('updates only the fields given', async () => {
    const result = await updateNote(2026, 11, 'n1', { text: 'x' })

    expect(tx.update).toHaveBeenCalledWith(expect.objectContaining({ path }), { text: 'x' })
    expect(result?.note).toMatchObject({ type: 'event', text: 'x' })
  })

  it('moves to another month with the same id, createdAt and source', async () => {
    const result = await updateNote(2026, 11, 'n1', { moveTo: { year: 2026, month: 12 } })

    expect(tx.delete).toHaveBeenCalledWith(expect.objectContaining({ path }))
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'reviews/2026-12' }),
      { year: 2026, month: 12, updatedAt: serverTimestamp },
      { merge: true }
    )
    expect(tx.create).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'reviews/2026-12/notes/n1' }),
      { type: 'event', text: 'Trip', source: 'api', createdAt: now }
    )
    expect(tx.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({ year: 2026, month: 12, note: { id: 'n1' } })
  })

  it('a move without stored source writes app', async () => {
    stubStored({ type: 'event', text: 'Trip', createdAt: now })

    await updateNote(2026, 11, 'n1', { moveTo: { year: 2026, month: 12 } })

    expect(tx.create).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'reviews/2026-12/notes/n1' }),
      { type: 'event', text: 'Trip', source: 'app', createdAt: now }
    )
  })

  it('moving to the same month updates in place', async () => {
    await updateNote(2026, 11, 'n1', { moveTo: { year: 2026, month: 11 }, text: 'y' })

    expect(tx.update).toHaveBeenCalledWith(expect.objectContaining({ path }), { text: 'y' })
    expect(tx.delete).not.toHaveBeenCalled()
    expect(tx.create).not.toHaveBeenCalled()
  })

  it('a same-month move with nothing else writes nothing', async () => {
    const result = await updateNote(2026, 11, 'n1', { moveTo: { year: 2026, month: 11 } })

    expect(tx.update).not.toHaveBeenCalled()
    expect(tx.delete).not.toHaveBeenCalled()
    expect(tx.set).not.toHaveBeenCalled()
    expect(tx.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      year: 2026,
      month: 11,
      note: {
        id: 'n1',
        type: 'event',
        text: 'Trip',
        source: 'api',
        createdAt: '2026-11-14T01:02:03.000Z',
      },
    })
  })

  it('returns null and writes nothing when the note does not exist', async () => {
    stubStored(null)

    expect(await updateNote(2026, 11, 'n1', { text: 'x' })).toBeNull()
    expect(await updateNote(2026, 11, 'n1', { moveTo: { year: 2026, month: 12 } })).toBeNull()
    expect(tx.update).not.toHaveBeenCalled()
    expect(tx.delete).not.toHaveBeenCalled()
    expect(tx.set).not.toHaveBeenCalled()
    expect(tx.create).not.toHaveBeenCalled()
  })
})
