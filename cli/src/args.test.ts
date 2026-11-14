import { describe, it, expect } from 'vitest'
import { UsageError, parseArgs, tokyoMonth } from './args'

// 2026-11-30 16:30 UTC is already December 1st in Tokyo.
const lateNovemberUtc = new Date('2026-11-30T16:30:00Z')

describe('tokyoMonth', () => {
  it('uses the Asia/Tokyo calendar', () => {
    expect(tokyoMonth(lateNovemberUtc)).toEqual({ year: 2026, month: 12 })
    expect(tokyoMonth(new Date('2026-11-30T14:00:00Z'))).toEqual({ year: 2026, month: 11 })
  })
})

describe('parseArgs', () => {
  it('parses add with the current Tokyo month by default', () => {
    expect(parseArgs(['add', 'learn', 'Firestore batches'], lateNovemberUtc)).toEqual({
      command: 'add',
      type: 'learn',
      text: 'Firestore batches',
      month: { year: 2026, month: 12 },
    })
  })

  it.each([
    [['add', 'next', 'Read', '--month', '2026-03']],
    [['add', '--month', '2026-03', 'next', 'Read']],
    [['add', 'next', 'Read', '--month=2026-03']],
  ])('accepts --month in %j', (argv) => {
    expect(parseArgs(argv, lateNovemberUtc)).toMatchObject({
      type: 'next',
      text: 'Read',
      month: { year: 2026, month: 3 },
    })
  })

  it.each([[[]], [['--help']], [['-h']], [['help']]])('returns help for %j', (argv) => {
    expect(parseArgs(argv, lateNovemberUtc)).toEqual({ command: 'help' })
  })

  it.each([
    [['list'], 'Unknown command: list'],
    [['add'], 'Expected a type'],
    [['add', 'idea', 'x'], 'Type must be one of: event, learn, next'],
    [['add', 'event'], 'Expected the note text'],
    [['add', 'event', '   '], 'Expected the note text'],
    [['add', 'event', 'a', 'b'], 'Unexpected argument: b'],
    [['add', 'event', 'x', '--month'], 'Month must look like YYYY-MM'],
    [['add', 'event', 'x', '--month', '2026-13'], 'Month must look like YYYY-MM'],
    [['add', 'event', 'x', '--month', '26-1'], 'Month must look like YYYY-MM'],
    [['add', 'event', 'x', '--color'], 'Unknown option: --color'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv, lateNovemberUtc)).toThrow(new UsageError(message))
  })
})
