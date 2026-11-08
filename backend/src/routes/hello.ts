import { Router } from 'express'
import { recordVisit } from '../services/hello'

export function createHelloRouter(): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    try {
      const visits = await recordVisit()
      res.json({ message: 'Hello, owlet', visits })
    } catch (err) {
      console.error('Failed to record visit', err)
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
