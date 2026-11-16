import { describe, expect, it } from 'vitest'
import { applyRefresh } from './notes'
import type { Note } from './notes'

const note = (id: string, createdAt: string, extra: Partial<Note> = {}): Note => ({
  id,
  type: 'event',
  text: id,
  source: 'app',
  createdAt,
  ...extra,
})

const a = note('a', '2026-11-01T00:00:00Z')
const b = note('b', '2026-11-02T00:00:00Z')
const c = note('c', '2026-11-03T00:00:00Z')
const none = { added: new Set<string>(), deleted: new Set<string>() }

describe('applyRefresh', () => {
  it('takes the server list', () => {
    expect(applyRefresh([a, b], [a, c], none)).toEqual([a, c])
  })

  it('keeps a note added during the refresh', () => {
    expect(applyRefresh([a, b], [a], { ...none, added: new Set(['b']) })).toEqual([a, b])
  })

  it('hides a note deleted locally', () => {
    expect(applyRefresh([a], [a, b], { ...none, deleted: new Set(['b']) })).toEqual([a])
  })

  it('sorts by createdAt', () => {
    expect(applyRefresh([], [c, a], none)).toEqual([a, c])
  })

  it("keeps the server's source", () => {
    const fromApi = note('a', a.createdAt, { source: 'api' })
    expect(applyRefresh([a], [fromApi], none)[0].source).toBe('api')
  })
})
