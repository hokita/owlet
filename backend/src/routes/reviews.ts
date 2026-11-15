import { Router } from 'express'
import type { Request, RequestHandler, Response } from 'express'
import { addNote, deleteNote, listNotes } from '../services/reviews'
import { parseNoteInput, parseYearMonth } from '../services/noteInput'

function parseMonth(req: Request) {
  return parseYearMonth(req.params.year, req.params.month)
}

function internalError(res: Response, message: string, err: unknown) {
  console.error(message, err)
  res.status(500).json({ error: 'Internal error' })
}

// userAuth (the Firebase sign-in) guards every route.
export function createReviewsRouter({ userAuth }: { userAuth: RequestHandler }): Router {
  const router = Router()

  router.get('/:year/:month', userAuth, async (req, res) => {
    const ym = parseMonth(req)
    if (!ym) {
      res.status(400).json({ error: 'Invalid month' })
      return
    }
    try {
      const notes = await listNotes(ym.year, ym.month)
      res.json({ ...ym, notes })
    } catch (err) {
      internalError(res, 'Failed to list notes', err)
    }
  })

  router.post('/:year/:month/notes', userAuth, async (req, res) => {
    const ym = parseMonth(req)
    if (!ym) {
      res.status(400).json({ error: 'Invalid month' })
      return
    }
    const input = parseNoteInput(req.body ?? {})
    if (!input.ok) {
      res.status(400).json({ error: input.error })
      return
    }
    try {
      const note = await addNote(ym.year, ym.month, {
        type: input.type,
        text: input.text,
        source: 'app',
      })
      res.status(201).json(note)
    } catch (err) {
      internalError(res, 'Failed to add note', err)
    }
  })

  router.delete('/:year/:month/notes/:id', userAuth, async (req, res) => {
    const ym = parseMonth(req)
    if (!ym) {
      res.status(400).json({ error: 'Invalid month' })
      return
    }
    try {
      await deleteNote(ym.year, ym.month, req.params.id)
      res.status(204).end()
    } catch (err) {
      internalError(res, 'Failed to delete note', err)
    }
  })

  return router
}
