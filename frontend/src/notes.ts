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
