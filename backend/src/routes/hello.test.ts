import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../services/hello', () => ({ recordVisit: vi.fn() }))

import { recordVisit } from '../services/hello'
import { createHelloRouter } from './hello'

const app = express().use('/api/hello', createHelloRouter())

describe('GET /api/hello', () => {
  beforeEach(() => {
    vi.mocked(recordVisit).mockReset()
  })

  it('returns the message and visit count', async () => {
    vi.mocked(recordVisit).mockResolvedValue(3)
    const res = await request(app).get('/api/hello')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Hello, owlet', visits: 3 })
  })

  it('returns 500 when Firestore fails', async () => {
    vi.mocked(recordVisit).mockRejectedValue(new Error('boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).get('/api/hello')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal error' })
    errSpy.mockRestore()
  })
})
