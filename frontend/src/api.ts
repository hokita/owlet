import { auth } from './firebase'
import type { YearMonth } from './month'
import type { Note, NoteType } from './notes'

export interface Review extends YearMonth {
  notes: Note[]
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_URL
  if (!baseUrl) throw new Error('VITE_API_URL is not set')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const token = await user.getIdToken()
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

const reviewPath = ({ year, month }: YearMonth) => `/api/reviews/${year}/${month}`

export const api = {
  getReview: (ym: YearMonth) => request<Review>(reviewPath(ym)),
  addNote: (ym: YearMonth, input: { type: NoteType; text: string }) =>
    request<Note>(`${reviewPath(ym)}/notes`, { method: 'POST', body: JSON.stringify(input) }),
  deleteNote: (ym: YearMonth, id: string) =>
    request<void>(`${reviewPath(ym)}/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
