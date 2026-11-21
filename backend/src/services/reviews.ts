import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import type { NoteUpdate } from './noteInput'

export const NOTE_TYPES = ['event', 'learn', 'next'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export type NoteSource = 'app' | 'api'

export interface Note {
  id: string
  type: NoteType
  text: string
  source: NoteSource
  createdAt: string
}

function reviewRef(year: number, month: number) {
  const id = `${year}-${String(month).padStart(2, '0')}`
  return getFirestore().collection('reviews').doc(id)
}

function toNote(id: string, data: FirebaseFirestore.DocumentData): Note {
  return {
    id,
    type: data.type as NoteType,
    text: data.text as string,
    source: data.source === 'api' ? 'api' : 'app',
    createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
  }
}

export async function listNotes(year: number, month: number): Promise<Note[]> {
  const snap = await reviewRef(year, month).collection('notes').orderBy('createdAt', 'asc').get()
  return snap.docs.map((doc) => toNote(doc.id, doc.data()))
}

export async function addNote(
  year: number,
  month: number,
  input: { type: NoteType; text: string; source: NoteSource }
): Promise<Note> {
  const review = reviewRef(year, month)
  const noteRef = review.collection('notes').doc()
  const createdAt = Timestamp.now()
  const batch = getFirestore().batch()
  batch.set(review, { year, month, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  batch.set(noteRef, { type: input.type, text: input.text, source: input.source, createdAt })
  await batch.commit()
  return { id: noteRef.id, ...input, createdAt: createdAt.toDate().toISOString() }
}

export async function deleteNote(year: number, month: number, id: string): Promise<void> {
  await reviewRef(year, month).collection('notes').doc(id).delete()
}

export async function updateNote(
  year: number,
  month: number,
  id: string,
  update: NoteUpdate
): Promise<{ year: number; month: number; note: Note } | null> {
  const db = getFirestore()
  const noteRef = reviewRef(year, month).collection('notes').doc(id)
  const fields: { type?: NoteType; text?: string } = {}
  if (update.type !== undefined) fields.type = update.type
  if (update.text !== undefined) fields.text = update.text
  const moveTo =
    update.moveTo && (update.moveTo.year !== year || update.moveTo.month !== month)
      ? update.moveTo
      : undefined

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(noteRef)
    if (!snap.exists) return null
    const stored = snap.data() as FirebaseFirestore.DocumentData

    if (!moveTo) {
      if (Object.keys(fields).length > 0) tx.update(noteRef, fields)
      return { year, month, note: toNote(id, { ...stored, ...fields }) }
    }

    const target = reviewRef(moveTo.year, moveTo.month)
    const moved = {
      type: fields.type ?? stored.type,
      text: fields.text ?? stored.text,
      source: stored.source === 'api' ? 'api' : 'app',
      createdAt: stored.createdAt,
    }
    tx.delete(noteRef)
    tx.set(
      target,
      { year: moveTo.year, month: moveTo.month, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    tx.create(target.collection('notes').doc(id), moved)
    return { year: moveTo.year, month: moveTo.month, note: toNote(id, moved) }
  })
}
