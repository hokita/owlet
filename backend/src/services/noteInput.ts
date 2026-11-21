import { NOTE_TYPES } from './reviews'
import type { NoteType } from './reviews'

const MAX_TEXT_LENGTH = 500

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

export function normalizeNoteText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
}

function parseText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = normalizeNoteText(value)
  if (!text || text.length > MAX_TEXT_LENGTH) return null
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

export interface NoteUpdate {
  type?: NoteType
  text?: string
  moveTo?: { year: number; month: number }
}

export function parseNoteUpdate(input: { type?: unknown; text?: unknown; moveTo?: unknown }):
  | { ok: true; update: NoteUpdate }
  | {
      ok: false
      error: 'Invalid type' | 'Invalid text' | 'Invalid month' | 'Nothing to update'
    } {
  const update: NoteUpdate = {}
  if (input.type !== undefined) {
    if (!isNoteType(input.type)) return { ok: false, error: 'Invalid type' }
    update.type = input.type
  }
  if (input.text !== undefined) {
    const text = parseText(input.text)
    if (text === null) return { ok: false, error: 'Invalid text' }
    update.text = text
  }
  if (input.moveTo !== undefined) {
    const target = input.moveTo as { year?: unknown; month?: unknown } | null
    const moveTo =
      typeof target === 'object' && target !== null
        ? parseYearMonth(target.year, target.month)
        : null
    if (moveTo === null) return { ok: false, error: 'Invalid month' }
    update.moveTo = moveTo
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nothing to update' }
  return { ok: true, update }
}

export function parseNoteId(id: unknown): string | null {
  if (typeof id !== 'string' || !id || id.includes('/')) return null
  return id
}
