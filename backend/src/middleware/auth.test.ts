import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const mockVerifyIdToken = vi.fn()
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}))

import { authMiddleware } from './auth'

const app = express()
app.get('/test', authMiddleware, (_req, res) => res.json({ ok: true }))

describe('authMiddleware', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ALLOWED_EMAILS = 'owner@example.com'
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/test')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Missing token' })
  })

  it('returns 401 when token verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'))
    const res = await request(app).get('/test').set('Authorization', 'Bearer bad-token')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid token' })
    expect(warnSpy).toHaveBeenCalled()
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('bad-token')
  })

  it('returns 401 when email is not in the allowlist', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: 'other@example.com',
      email_verified: true,
    })
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
    expect(warnSpy).toHaveBeenCalledWith('Rejected sign-in:', {
      uid: 'u1',
      email: 'other@example.com',
      emailVerified: true,
    })
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('valid-token')
  })

  it('returns 401 when the token has no email claim', async () => {
    mockVerifyIdToken.mockResolvedValue({ email: undefined, email_verified: true })
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when the email is not verified', async () => {
    mockVerifyIdToken.mockResolvedValue({ email: 'owner@example.com', email_verified: false })
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('calls next when the token is valid, verified, and the email is allowed (case-insensitive)', async () => {
    mockVerifyIdToken.mockResolvedValue({ email: 'OWNER@example.com', email_verified: true })
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token')
  })
})
