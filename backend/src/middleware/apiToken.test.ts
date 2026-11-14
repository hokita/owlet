import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import type { RequestHandler } from 'express'
import request from 'supertest'
import { apiTokenMatcher, userOrApiTokenAuth } from './apiToken'
import { createRateLimiter } from './rateLimit'

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

describe('userOrApiTokenAuth', () => {
  const userAuth = vi.fn<Parameters<RequestHandler>, void>((_req, res) => {
    res.status(401).json({ error: 'Invalid token' })
  })

  function appWith(limit = 30) {
    const limiter = createRateLimiter({ limit, windowMs: 3_600_000 })
    return express()
      .use(userOrApiTokenAuth({ matches: apiTokenMatcher(TOKEN), limiter, userAuth }))
      .post('/', (_req, res) => res.json({ authSource: res.locals.authSource }))
  }

  it('accepts the API token and marks the request as api', async () => {
    const res = await request(appWith()).post('/').set('Authorization', `Bearer ${TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ authSource: 'api' })
    expect(userAuth).not.toHaveBeenCalled()
  })

  it('hands any other bearer value to user auth', async () => {
    userAuth.mockClear()
    const res = await request(appWith()).post('/').set('Authorization', 'Bearer firebase-id-token')
    expect(res.status).toBe(401)
    expect(userAuth).toHaveBeenCalledTimes(1)
  })

  it('hands everything to user auth when no token is configured', async () => {
    userAuth.mockClear()
    const app = express()
      .use(
        userOrApiTokenAuth({
          matches: apiTokenMatcher(undefined),
          limiter: createRateLimiter({ limit: 30, windowMs: 1000 }),
          userAuth,
        })
      )
      .post('/', (_req, res) => res.json({}))
    const res = await request(app).post('/').set('Authorization', `Bearer ${TOKEN}`)
    expect(res.status).toBe(401)
    expect(userAuth).toHaveBeenCalledTimes(1)
  })

  it('rate limits API token requests with 429 and Retry-After', async () => {
    const app = appWith(2)
    const send = () => request(app).post('/').set('Authorization', `Bearer ${TOKEN}`)
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(200)
    const res = await send()
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'Too many requests' })
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
  })
})
