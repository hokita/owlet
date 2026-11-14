import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue('fake-token') } as {
    getIdToken: () => Promise<string>
  } | null,
}))
vi.mock('./firebase', () => ({ auth: mockAuth }))

import { api } from './api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const signedInUser = mockAuth.currentUser

beforeEach(() => {
  mockFetch.mockReset()
  mockAuth.currentUser = signedInUser
  vi.stubEnv('VITE_API_URL', 'http://api.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const note = { id: 'n1', type: 'event', text: 'Trip', createdAt: '2026-11-14T00:00:00.000Z' }

describe('api.getReview', () => {
  it('sends the bearer token to /api/reviews/:year/:month', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ year: 2026, month: 11, notes: [note] }),
    })
    const result = await api.getReview({ year: 2026, month: 11 })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/api/reviews/2026/11',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
      })
    )
    expect(result).toEqual({ year: 2026, month: 11, notes: [note] })
  })

  it('throws on a non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(api.getReview({ year: 2026, month: 11 })).rejects.toThrow('API error: 401')
  })

  it('throws without calling fetch when signed out', async () => {
    mockAuth.currentUser = null
    await expect(api.getReview({ year: 2026, month: 11 })).rejects.toThrow('Not signed in')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws without calling fetch when VITE_API_URL is not set', async () => {
    vi.stubEnv('VITE_API_URL', '')
    await expect(api.getReview({ year: 2026, month: 11 })).rejects.toThrow(
      'VITE_API_URL is not set'
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('api.addNote', () => {
  it('POSTs the note as JSON', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => note })
    const result = await api.addNote({ year: 2026, month: 11 }, { type: 'event', text: 'Trip' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/api/reviews/2026/11/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'event', text: 'Trip' }),
      })
    )
    expect(result).toEqual(note)
  })
})

describe('api.deleteNote', () => {
  it('DELETEs the note without reading a body', async () => {
    const json = vi.fn()
    mockFetch.mockResolvedValue({ ok: true, status: 204, json })
    await api.deleteNote({ year: 2026, month: 11 }, 'n1')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/api/reviews/2026/11/notes/n1',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(json).not.toHaveBeenCalled()
  })
})
