import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'

export const NOTE_TYPES = ['event', 'learn', 'next'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

// Where a note came from: the app, or an agent using the API token.
export type NoteSource = 'app' | 'api'

export interface Note {
  id: string
  type: NoteType
  text: string
  source: NoteSource
  createdAt: string
}

// One review doc per month, keyed `YYYY-MM`, so "one review per month" can't race.
function reviewRef(year: number, month: number) {
  const id = `${year}-${String(month).padStart(2, '0')}`
  return getFirestore().collection('reviews').doc(id)
}

export async function listNotes(year: number, month: number): Promise<Note[]> {
  const snap = await reviewRef(year, month).collection('notes').orderBy('createdAt', 'asc').get()
  return snap.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      type: data.type as NoteType,
      text: data.text as string,
      // Notes saved before `source` existed came from the app.
      source: data.source === 'api' ? 'api' : 'app',
      createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
    }
  })
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
