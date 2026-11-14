import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app'

describe('app', () => {
  it('GET /health returns ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /api/reviews without a token returns 401', async () => {
    const res = await request(createApp()).get('/api/reviews/2026/11')
    expect(res.status).toBe(401)
  })
})
