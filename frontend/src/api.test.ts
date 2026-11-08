import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('fake-token') } },
}))

import { api } from './api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
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
})
