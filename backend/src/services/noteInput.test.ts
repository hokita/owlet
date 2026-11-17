import { describe, it, expect } from 'vitest'
import { parseNoteId, parseNoteInput, parseNoteUpdate, parseYearMonth } from './noteInput'

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

describe('parseNoteUpdate', () => {
  it('accepts each field alone', () => {
    expect(parseNoteUpdate({ text: ' Fixed ' })).toEqual({ ok: true, update: { text: 'Fixed' } })
    expect(parseNoteUpdate({ type: 'next' })).toEqual({ ok: true, update: { type: 'next' } })
    expect(parseNoteUpdate({ moveTo: { year: 2001, month: 9 } })).toEqual({
      ok: true,
      update: { moveTo: { year: 2001, month: 9 } },
    })
  })

  it('accepts all fields together', () => {
    expect(
      parseNoteUpdate({ type: 'event', text: 'Both', moveTo: { year: 2026, month: 12 } })
    ).toEqual({
      ok: true,
      update: { type: 'event', text: 'Both', moveTo: { year: 2026, month: 12 } },
    })
  })

  it.each([{}, { source: 'app' }])('rejects nothing to update: %j', (input) => {
    expect(parseNoteUpdate(input)).toEqual({ ok: false, error: 'Nothing to update' })
  })

  it('drops unknown fields', () => {
    const result = parseNoteUpdate({ text: 'a', source: 'api' })
    expect(result).toEqual({ ok: true, update: { text: 'a' } })
  })

  it.each([
    [{ type: 'todo' }, 'Invalid type'],
    [{ text: '' }, 'Invalid text'],
    [{ text: '   ' }, 'Invalid text'],
    [{ text: 'a\nb' }, 'Invalid text'],
    [{ text: 'x'.repeat(501) }, 'Invalid text'],
    [{ moveTo: { year: 1999, month: 1 } }, 'Invalid month'],
    [{ moveTo: { year: 2026, month: 13 } }, 'Invalid month'],
    [{ moveTo: '2026-11' }, 'Invalid month'],
    [{ moveTo: null }, 'Invalid month'],
  ])('rejects a present but invalid field: %j', (input, error) => {
    expect(parseNoteUpdate(input)).toEqual({ ok: false, error })
  })

  it('accepts exactly 500 characters', () => {
    const text = 'x'.repeat(500)
    expect(parseNoteUpdate({ text })).toEqual({ ok: true, update: { text } })
  })
})
