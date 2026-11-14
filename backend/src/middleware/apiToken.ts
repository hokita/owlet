import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { RateLimiter } from './rateLimit'

// 32 random bytes in base64url; `openssl rand -hex 32` (64 chars) is longer.
const MIN_TOKEN_LENGTH = 43

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

// Returns a constant-time matcher for the configured API token, or null when
// token auth is off (unset, or too short to be a real random token).
export function apiTokenMatcher(
  configured: string | undefined
): ((token: string) => boolean) | null {
  if (!configured) return null
  if (configured.length < MIN_TOKEN_LENGTH) {
    console.warn(
      `OWLET_API_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters; API token auth is disabled`
    )
    return null
  }
  // Comparing digests keeps both sides the same length, as timingSafeEqual requires.
  const expected = digest(configured)
  return (token) => timingSafeEqual(digest(token), expected)
}

// For the add-note route only: accepts the API token (rate limited) or falls
// back to the normal Firebase user auth. Sets res.locals.authSource = 'api'
// for token requests.
export function userOrApiTokenAuth({
  matches,
  limiter,
  userAuth,
}: {
  matches: ((token: string) => boolean) | null
  limiter: RateLimiter
  userAuth: RequestHandler
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split('Bearer ')[1]
    if (!matches || !token || !matches(token)) {
      return userAuth(req, res, next)
    }
    const allowed = limiter.take()
    if (!allowed.ok) {
      res.setHeader('Retry-After', String(allowed.retryAfterSeconds))
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    res.locals.authSource = 'api'
    next()
  }
}
