import { NOTE_TYPES } from './reviews'
import type { NoteType } from './reviews'

// Input checks shared by the REST routes and the MCP tools, so both accept
// exactly the same notes.

const MAX_TEXT_LENGTH = 500

// Accepts numbers (MCP) or numeric strings (route params).
export function parseYearMonth(
  rawYear: unknown,
  rawMonth: unknown
): { year: number; month: number } | null {
  const year = Number(rawYear)
  const month = Number(rawMonth)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

function isNoteType(value: unknown): value is NoteType {
  return (NOTE_TYPES as readonly unknown[]).includes(value)
}

function parseText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > MAX_TEXT_LENGTH || /[\r\n]/.test(text)) return null
  return text
}

export function parseNoteInput(input: {
  type?: unknown
  text?: unknown
}):
  | { ok: true; type: NoteType; text: string }
  | { ok: false; error: 'Invalid type' | 'Invalid text' } {
  if (!isNoteType(input.type)) return { ok: false, error: 'Invalid type' }
  const text = parseText(input.text)
  if (text === null) return { ok: false, error: 'Invalid text' }
  return { ok: true, type: input.type, text }
}

// A Firestore doc id: a "/" would point the delete at a different path.
export function parseNoteId(id: unknown): string | null {
  if (typeof id !== 'string' || !id || id.includes('/')) return null
  return id
}
