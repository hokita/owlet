import type { NoteType, YearMonth } from './args'

export interface Note {
  id: string
  type: NoteType
  text: string
  source: 'app' | 'api'
  createdAt: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function addNote({
  baseUrl,
  token,
  month,
  type,
  text,
  fetch,
}: {
  baseUrl: string
  token: string
  month: YearMonth
  type: NoteType
  text: string
  fetch: typeof globalThis.fetch
}): Promise<Note> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/reviews/${month.year}/${month.month}/notes`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, text }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as Note
}
