export const NOTE_TYPES = ['event', 'learn', 'next'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export interface Note {
  id: string
  type: NoteType
  text: string
  createdAt: string
}
