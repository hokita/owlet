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

describe('api.getHello', () => {
  it('getHello sends the bearer token to /api/hello', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Hello, owlet', visits: 3 }),
    })
    const result = await api.getHello()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/hello'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
      })
    )
    expect(result).toEqual({ message: 'Hello, owlet', visits: 3 })
  })

  it('throws on a non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(api.getHello()).rejects.toThrow('API error: 401')
  })

  it('throws without calling fetch when signed out', async () => {
    mockAuth.currentUser = null
    await expect(api.getHello()).rejects.toThrow('Not signed in')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws without calling fetch when VITE_API_URL is not set', async () => {
    vi.stubEnv('VITE_API_URL', '')
    await expect(api.getHello()).rejects.toThrow('VITE_API_URL is not set')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
