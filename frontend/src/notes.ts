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

// Combines note lists by id. A note added before the month finishes loading
// can arrive both from the POST and in the GET, in either order, so every
// update merges instead of appending or replacing.
export function mergeNotes(current: Note[], incoming: Note[]): Note[] {
  const byId = new Map(current.map((n) => [n.id, n]))
  for (const note of incoming) byId.set(note.id, note)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// The server's list is the truth after a refresh, except for edits made here
// while it was in flight: a note added locally stays, a note deleted locally
// stays hidden.
export function applyRefresh(
  current: Note[],
  server: Note[],
  local: { added: ReadonlySet<string>; deleted: ReadonlySet<string> }
): Note[] {
  return mergeNotes(
    server.filter((n) => !local.deleted.has(n.id)),
    current.filter((n) => local.added.has(n.id))
  )
}
