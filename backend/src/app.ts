import express from 'express'
import cors from 'cors'
import { authMiddleware } from './middleware/auth'
import { apiTokenAuth, apiTokenMatcher } from './middleware/apiToken'
import { createRateLimiter } from './middleware/rateLimit'
import { createReviewsRouter } from './routes/reviews'
import { createMcpRequestHandler } from './mcp/server'

const API_TOKEN_LIMIT_PER_HOUR = 30

export function createApp() {
  const app = express()
  app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
  app.use(express.json())
  app.get('/health', (_req, res) => res.json({ ok: true }))
  const matches = apiTokenMatcher(process.env.OWLET_API_TOKEN)
  const apiTokenLimiter = createRateLimiter({
    limit: API_TOKEN_LIMIT_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  })
  app.use('/api/reviews', createReviewsRouter({ userAuth: authMiddleware }))
  app.all('/mcp', apiTokenAuth({ matches }), createMcpRequestHandler({ limiter: apiTokenLimiter }))
  return app
}
