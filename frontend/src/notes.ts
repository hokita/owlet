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

export function mergeNotes(current: Note[], incoming: Note[]): Note[] {
  const byId = new Map(current.map((n) => [n.id, n]))
  for (const note of incoming) byId.set(note.id, note)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function applyRefresh(
  current: Note[],
  server: Note[],
  local: {
    added: ReadonlySet<string>
    deleted: ReadonlySet<string>
    edited: ReadonlySet<string>
  }
): Note[] {
  return mergeNotes(
    server.filter((n) => !local.deleted.has(n.id)),
    current.filter(
      (n) => !local.deleted.has(n.id) && (local.added.has(n.id) || local.edited.has(n.id))
    )
  )
}

export function replaceNote(notes: Note[], note: Note): Note[] {
  return notes.map((n) => (n.id === note.id ? note : n))
}
