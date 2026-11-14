import { describe, it, expect, vi, beforeEach } from 'vitest'

const serverTimestamp = { sentinel: 'serverTimestamp' }
const now = { toDate: () => new Date('2026-11-14T01:02:03.000Z') }

const get = vi.fn()
const orderBy = vi.fn(() => ({ get }))
const deleteDoc = vi.fn()
const batch = { set: vi.fn(), commit: vi.fn() }

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
  getFirestore: () => ({ collection: collectionRef, batch: () => batch }),
  FieldValue: { serverTimestamp: () => serverTimestamp },
  Timestamp: { now: () => now },
}))

import { addNote, deleteNote, listNotes } from './reviews'

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
