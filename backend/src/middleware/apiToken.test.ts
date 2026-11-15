import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { apiTokenAuth, apiTokenMatcher } from './apiToken'

const TOKEN = 'a'.repeat(64)

describe('apiTokenMatcher', () => {
  it('is null when no token is configured', () => {
    expect(apiTokenMatcher(undefined)).toBeNull()
    expect(apiTokenMatcher('')).toBeNull()
  })

  it('is null, with a warning, when the configured token is too short', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(apiTokenMatcher('x'.repeat(42))).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('matches only the exact token', () => {
    const matches = apiTokenMatcher(TOKEN)!
    expect(matches(TOKEN)).toBe(true)
    expect(matches(TOKEN.slice(1))).toBe(false)
    expect(matches(TOKEN + 'a')).toBe(false)
    expect(matches('b'.repeat(64))).toBe(false)
    expect(matches('')).toBe(false)
  })
})

describe('apiTokenAuth', () => {
  function appWith(matches = apiTokenMatcher(TOKEN)) {
    return express()
      .use(apiTokenAuth({ matches }))
      .post('/', (_req, res) => res.json({ ok: true }))
  }

  it('accepts the API token', async () => {
    const res = await request(appWith()).post('/').set('Authorization', `Bearer ${TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('rejects a missing Authorization header with 401', async () => {
    const res = await request(appWith()).post('/')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid token' })
  })

  it('rejects any other bearer value with 401', async () => {
    const res = await request(appWith()).post('/').set('Authorization', 'Bearer firebase-id-token')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid token' })
  })

  it('rejects everything when no token is configured', async () => {
    const res = await request(appWith(apiTokenMatcher(undefined)))
      .post('/')
      .set('Authorization', `Bearer ${TOKEN}`)
    expect(res.status).toBe(401)
  })

  it('does not rate limit', async () => {
    const app = appWith()
    for (let i = 0; i < 40; i++) {
      const res = await request(app).post('/').set('Authorization', `Bearer ${TOKEN}`)
      expect(res.status).toBe(200)
    }
  })
})
