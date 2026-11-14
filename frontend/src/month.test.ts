import { describe, it, expect } from 'vitest'
import { currentMonth, formatMonth, monthPath, parseMonthPath, shiftMonth } from './month'

describe('parseMonthPath', () => {
  it.each([
    ['/2026/11', { year: 2026, month: 11 }],
    ['/2026/3', { year: 2026, month: 3 }],
    ['/2026/03/', { year: 2026, month: 3 }],
  ])('parses %s', (path, expected) => {
    expect(parseMonthPath(path)).toEqual(expected)
  })

  it.each(['/', '/2026', '/2026/13', '/2026/0', '/1999/1', '/abc/1', '/2026/11/x'])(
    'returns null for %s',
    (path) => {
      expect(parseMonthPath(path)).toBeNull()
    }
  )
})

describe('monthPath', () => {
  it('builds /year/month', () => {
    expect(monthPath({ year: 2026, month: 3 })).toBe('/2026/3')
  })
})

describe('shiftMonth', () => {
  it('moves within a year', () => {
    expect(shiftMonth({ year: 2026, month: 5 }, 1)).toEqual({ year: 2026, month: 6 })
  })

  it('rolls over to the next year', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
  })

  it('rolls back to the previous year', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('formatMonth', () => {
  it('formats as an English month and year', () => {
    expect(formatMonth({ year: 2026, month: 11 })).toBe('November 2026')
  })
})

describe('currentMonth', () => {
  it('uses the local date', () => {
    expect(currentMonth(new Date(2026, 0, 31))).toEqual({ year: 2026, month: 1 })
  })
})
