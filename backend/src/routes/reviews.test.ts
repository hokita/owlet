import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import type { RequestHandler } from 'express'

vi.mock('../services/reviews', () => ({
  NOTE_TYPES: ['event', 'learn', 'next'],
  listNotes: vi.fn(),
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}))

import { addNote, deleteNote, listNotes } from '../services/reviews'
import { createReviewsRouter } from './reviews'

const pass: RequestHandler = (_req, _res, next) => next()
const app = express()
  .use(express.json())
  .use('/api/reviews', createReviewsRouter({ userAuth: pass, noteAuth: pass }))

const note = { id: 'n1', type: 'event', text: 'Trip', createdAt: '2026-11-14T00:00:00.000Z' }

describe('reviews routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('guards GET and DELETE with userAuth and POST with noteAuth', async () => {
    const deny =
      (name: string): RequestHandler =>
      (_req, res) => {
        res.status(401).json({ error: name })
      }
    const guarded = express()
      .use(express.json())
      .use(
        '/api/reviews',
        createReviewsRouter({ userAuth: deny('userAuth'), noteAuth: deny('noteAuth') })
      )
    expect((await request(guarded).get('/api/reviews/2026/11')).body).toEqual({
      error: 'userAuth',
    })
    expect((await request(guarded).delete('/api/reviews/2026/11/notes/n1')).body).toEqual({
      error: 'userAuth',
    })
    expect((await request(guarded).post('/api/reviews/2026/11/notes')).body).toEqual({
      error: 'noteAuth',
    })
  })

  describe('GET /api/reviews/:year/:month', () => {
    it('returns the notes for the month', async () => {
      vi.mocked(listNotes).mockResolvedValue([note] as never)
      const res = await request(app).get('/api/reviews/2026/11')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ year: 2026, month: 11, notes: [note] })
      expect(listNotes).toHaveBeenCalledWith(2026, 11)
    })

    it.each([
      ['1999', '1'],
      ['2101', '1'],
      ['2026', '0'],
      ['2026', '13'],
      ['abcd', '1'],
      ['2026', '1.5'],
    ])('rejects %s/%s with 400', async (year, month) => {
      const res = await request(app).get(`/api/reviews/${year}/${month}`)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Invalid month' })
      expect(listNotes).not.toHaveBeenCalled()
    })

    it('returns 500 when Firestore fails', async () => {
      vi.mocked(listNotes).mockRejectedValue(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await request(app).get('/api/reviews/2026/11')
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Internal error' })
      errSpy.mockRestore()
    })
  })

  describe('POST /api/reviews/:year/:month/notes', () => {
    it('adds a trimmed note and returns 201', async () => {
      vi.mocked(addNote).mockResolvedValue(note as never)
      const res = await request(app)
        .post('/api/reviews/2026/11/notes')
        .send({ type: 'event', text: '  Trip  ' })
      expect(res.status).toBe(201)
      expect(res.body).toEqual(note)
      expect(addNote).toHaveBeenCalledWith(2026, 11, { type: 'event', text: 'Trip', source: 'app' })
    })

    it('saves notes from API token requests with source api', async () => {
      vi.mocked(addNote).mockResolvedValue(note as never)
      const asApi: RequestHandler = (_req, res, next) => {
        res.locals.authSource = 'api'
        next()
      }
      const apiApp = express()
        .use(express.json())
        .use('/api/reviews', createReviewsRouter({ userAuth: pass, noteAuth: asApi }))
      const res = await request(apiApp)
        .post('/api/reviews/2026/11/notes')
        .send({ type: 'next', text: 'Read' })
      expect(res.status).toBe(201)
      expect(addNote).toHaveBeenCalledWith(2026, 11, { type: 'next', text: 'Read', source: 'api' })
    })

    it.each([
      [{ type: 'idea', text: 'x' }, 'Invalid type'],
      [{ text: 'x' }, 'Invalid type'],
      [{ type: 'event', text: '   ' }, 'Invalid text'],
      [{ type: 'event' }, 'Invalid text'],
      [{ type: 'event', text: 42 }, 'Invalid text'],
      [{ type: 'event', text: 'two\nlines' }, 'Invalid text'],
      [{ type: 'event', text: 'x'.repeat(501) }, 'Invalid text'],
    ])('rejects %j with 400', async (body, error) => {
      const res = await request(app).post('/api/reviews/2026/11/notes').send(body)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(addNote).not.toHaveBeenCalled()
    })

    it('rejects an invalid month with 400', async () => {
      const res = await request(app)
        .post('/api/reviews/2026/13/notes')
        .send({ type: 'event', text: 'x' })
      expect(res.status).toBe(400)
      expect(addNote).not.toHaveBeenCalled()
    })

    it('returns 500 when Firestore fails', async () => {
      vi.mocked(addNote).mockRejectedValue(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await request(app)
        .post('/api/reviews/2026/11/notes')
        .send({ type: 'event', text: 'x' })
      expect(res.status).toBe(500)
      errSpy.mockRestore()
    })
  })

  describe('DELETE /api/reviews/:year/:month/notes/:id', () => {
    it('deletes the note and returns 204', async () => {
      vi.mocked(deleteNote).mockResolvedValue()
      const res = await request(app).delete('/api/reviews/2026/11/notes/n1')
      expect(res.status).toBe(204)
      expect(deleteNote).toHaveBeenCalledWith(2026, 11, 'n1')
    })

    it('rejects an invalid month with 400', async () => {
      const res = await request(app).delete('/api/reviews/2026/0/notes/n1')
      expect(res.status).toBe(400)
      expect(deleteNote).not.toHaveBeenCalled()
    })

    it('returns 500 when Firestore fails', async () => {
      vi.mocked(deleteNote).mockRejectedValue(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await request(app).delete('/api/reviews/2026/11/notes/n1')
      expect(res.status).toBe(500)
      errSpy.mockRestore()
    })
  })
})
