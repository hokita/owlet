import express from 'express'
import cors from 'cors'
import { authMiddleware } from './middleware/auth'
import { apiTokenMatcher, userOrApiTokenAuth } from './middleware/apiToken'
import { createRateLimiter } from './middleware/rateLimit'
import { createReviewsRouter } from './routes/reviews'

// Agents using the API token may add up to this many notes per hour (per instance).
const API_TOKEN_LIMIT_PER_HOUR = 30

export function createApp() {
  const app = express()
  // The cors package does NOT default to "allow all" when origin is undefined — it emits
  // no CORS headers at all, which silently blocks every cross-origin request. Default to
  // '*' explicitly so dev (FRONTEND_URL unset) actually allows all origins as intended.
  app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
  app.use(express.json())
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use(
    '/api/reviews',
    createReviewsRouter({
      userAuth: authMiddleware,
      noteAuth: userOrApiTokenAuth({
        matches: apiTokenMatcher(process.env.OWLET_API_TOKEN),
        limiter: createRateLimiter({ limit: API_TOKEN_LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000 }),
        userAuth: authMiddleware,
      }),
    })
  )
  return app
}
