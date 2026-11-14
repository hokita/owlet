import { describe, it, expect, vi } from 'vitest'
import { ApiError, addNote } from './client'

const note = {
  id: 'n1',
  type: 'learn',
  text: 'Hi',
  source: 'api',
  createdAt: '2026-11-14T00:00:00Z',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const input = {
  baseUrl: 'https://api.test/',
  token: 'secret',
  month: { year: 2026, month: 3 },
  type: 'learn' as const,
  text: 'Hi',
}

describe('addNote', () => {
  it('POSTs the note with the bearer token and returns it', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, note))
    expect(await addNote({ ...input, fetch })).toEqual(note)
    expect(fetch).toHaveBeenCalledWith('https://api.test/api/reviews/2026/3/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ type: 'learn', text: 'Hi' }),
    })
  })

  it('throws the server error with its status', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'Invalid text' }))
    await expect(addNote({ ...input, fetch })).rejects.toEqual(new ApiError(400, 'Invalid text'))
  })

  it('copes with a non-JSON error body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 }))
    await expect(addNote({ ...input, fetch })).rejects.toEqual(new ApiError(502, 'HTTP 502'))
  })
})
