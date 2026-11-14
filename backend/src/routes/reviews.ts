import { Router } from 'express'
import type { Request, Response } from 'express'
import { NOTE_TYPES, addNote, deleteNote, listNotes } from '../services/reviews'
import type { NoteType } from '../services/reviews'

const MAX_TEXT_LENGTH = 500

function parseMonth(req: Request): { year: number; month: number } | null {
  const year = Number(req.params.year)
  const month = Number(req.params.month)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

function isNoteType(value: unknown): value is NoteType {
  return (NOTE_TYPES as readonly unknown[]).includes(value)
}

function parseText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > MAX_TEXT_LENGTH || /[\r\n]/.test(text)) return null
  return text
}

function internalError(res: Response, message: string, err: unknown) {
  console.error(message, err)
  res.status(500).json({ error: 'Internal error' })
}

export function createReviewsRouter(): Router {
  const router = Router()

  router.get('/:year/:month', async (req, res) => {
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

  router.post('/:year/:month/notes', async (req, res) => {
    const ym = parseMonth(req)
    if (!ym) {
      res.status(400).json({ error: 'Invalid month' })
      return
    }
    const { type } = req.body ?? {}
    if (!isNoteType(type)) {
      res.status(400).json({ error: 'Invalid type' })
      return
    }
    const text = parseText(req.body?.text)
    if (text === null) {
      res.status(400).json({ error: 'Invalid text' })
      return
    }
    try {
      const note = await addNote(ym.year, ym.month, { type, text })
      res.status(201).json(note)
    } catch (err) {
      internalError(res, 'Failed to add note', err)
    }
  })

  router.delete('/:year/:month/notes/:id', async (req, res) => {
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
