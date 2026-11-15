import { describe, it, expect } from 'vitest'
import { parseNoteId, parseNoteInput, parseYearMonth } from './noteInput'

describe('parseYearMonth', () => {
  it('accepts numbers and numeric strings', () => {
    expect(parseYearMonth(2026, 11)).toEqual({ year: 2026, month: 11 })
    expect(parseYearMonth('2026', '11')).toEqual({ year: 2026, month: 11 })
  })

  it.each([
    ['1999', '1'],
    ['2101', '1'],
    ['2026', '0'],
    ['2026', '13'],
    ['abcd', '1'],
    ['2026', '1.5'],
  ])('rejects %s/%s', (year, month) => {
    expect(parseYearMonth(year, month)).toBeNull()
  })
})

describe('parseNoteInput', () => {
  it('trims the text', () => {
    expect(parseNoteInput({ type: 'event', text: '  Trip  ' })).toEqual({
      ok: true,
      type: 'event',
      text: 'Trip',
    })
  })

  it('accepts exactly 500 characters', () => {
    expect(parseNoteInput({ type: 'learn', text: 'x'.repeat(500) }).ok).toBe(true)
  })

  it.each([
    [{ type: 'idea', text: 'x' }, 'Invalid type'],
    [{ text: 'x' }, 'Invalid type'],
    [{ type: 'event', text: '   ' }, 'Invalid text'],
    [{ type: 'event' }, 'Invalid text'],
    [{ type: 'event', text: 42 }, 'Invalid text'],
    [{ type: 'event', text: 'two\nlines' }, 'Invalid text'],
    [{ type: 'event', text: 'x'.repeat(501) }, 'Invalid text'],
  ])('rejects %j', (input, error) => {
    expect(parseNoteInput(input)).toEqual({ ok: false, error })
  })
})

describe('parseNoteId', () => {
  it('accepts a plain id', () => {
    expect(parseNoteId('n1')).toBe('n1')
  })

  it.each(['', 'a/b', 42, undefined])('rejects %j', (id) => {
    expect(parseNoteId(id)).toBeNull()
  })
})
