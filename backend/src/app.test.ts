import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

vi.mock('./services/reviews', () => ({
  NOTE_TYPES: ['event', 'learn', 'next'],
  listNotes: vi.fn().mockResolvedValue([]),
  addNote: vi.fn(async (_y: number, _m: number, input: object) => ({ id: 'n1', ...input })),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}))

import { addNote, deleteNote, listNotes } from './services/reviews'
import { createApp } from './app'

const TOKEN = 'k'.repeat(64)
const bearer = `Bearer ${TOKEN}`

describe('app', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('GET /health returns ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /api/reviews without a token returns 401', async () => {
    const res = await request(createApp()).get('/api/reviews/2026/11')
    expect(res.status).toBe(401)
  })

  describe('with OWLET_API_TOKEN set', () => {
    beforeEach(() => {
      vi.stubEnv('OWLET_API_TOKEN', TOKEN)
    })

    it('adds a note with the API token, marked as api', async () => {
      const res = await request(createApp())
        .post('/api/reviews/2026/11/notes')
        .set('Authorization', bearer)
        .send({ type: 'learn', text: 'From an agent' })
      expect(res.status).toBe(201)
      expect(addNote).toHaveBeenCalledWith(2026, 11, {
        type: 'learn',
        text: 'From an agent',
        source: 'api',
      })
    })

    it('rejects the API token for listing notes', async () => {
      const res = await request(createApp())
        .get('/api/reviews/2026/11')
        .set('Authorization', bearer)
      expect(res.status).toBe(401)
      expect(listNotes).not.toHaveBeenCalled()
    })

    it('rejects the API token for deleting notes', async () => {
      const res = await request(createApp())
        .delete('/api/reviews/2026/11/notes/n1')
        .set('Authorization', bearer)
      expect(res.status).toBe(401)
      expect(deleteNote).not.toHaveBeenCalled()
    })

    it('rate limits API token requests after 30 an hour', async () => {
      const app = createApp()
      const send = () =>
        request(app)
          .post('/api/reviews/2026/11/notes')
          .set('Authorization', bearer)
          .send({ type: 'event', text: 'x' })
      for (let i = 0; i < 30; i++) expect((await send()).status).toBe(201)
      expect((await send()).status).toBe(429)
    })
  })

  it('rejects the API token everywhere when OWLET_API_TOKEN is unset', async () => {
    vi.stubEnv('OWLET_API_TOKEN', '')
    const res = await request(createApp())
      .post('/api/reviews/2026/11/notes')
      .set('Authorization', bearer)
      .send({ type: 'event', text: 'x' })
    expect(res.status).toBe(401)
    expect(addNote).not.toHaveBeenCalled()
  })
})
