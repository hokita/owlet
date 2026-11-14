import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { api } from '../api'
import { formatMonth, shiftMonth } from '../month'
import type { YearMonth } from '../month'
import type { Note, NoteType } from '../notes'
import Composer from '../components/Composer'
import NoteRow from '../components/NoteRow'
import { useKeyboardInset } from '../useKeyboardInset'

// How long a deleted note can be brought back before the delete is sent.
const UNDO_MS = 5000

const SECTIONS: { type: NoteType; title: string }[] = [
  { type: 'event', title: 'Events' },
  { type: 'learn', title: 'Learns' },
  { type: 'next', title: 'Nexts' },
]

// Combines note lists by id. A note added before the month finishes loading
// can arrive both from the POST and in the GET, in either order, so every
// update merges instead of appending or replacing.
function mergeNotes(current: Note[], incoming: Note[]): Note[] {
  const byId = new Map(current.map((n) => [n.id, n]))
  for (const note of incoming) byId.set(note.id, note)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

interface MonthPageProps {
  month: YearMonth
  onNavigate: (month: YearMonth) => void
}

// Rendered with `key` = the month, so switching months remounts it: state
// starts fresh, a stale load is ignored, and a pending delete is sent.
export default function MonthPage({ month, onNavigate }: MonthPageProps) {
  // `notes` can hold notes added before the month has loaded; they're only
  // shown once a load succeeds, so a partial list never passes for the month.
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  // Kept apart from add/delete errors: it stays up, with Retry, until a load
  // succeeds, whatever else happens meanwhile.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pendingNote, setPendingNote] = useState<Note | null>(null)
  const pending = useRef<{ note: Note; timer: ReturnType<typeof setTimeout> } | null>(null)
  const keyboardInset = useKeyboardInset()

  // Resolves once the delete request has settled (failures are handled here).
  const sendPendingDelete = useCallback((): Promise<void> => {
    const current = pending.current
    if (!current) return Promise.resolve()
    clearTimeout(current.timer)
    pending.current = null
    setPendingNote(null)
    return api.deleteNote(month, current.note.id).catch((e: Error) => {
      setNotes((prev) => mergeNotes(prev, [current.note]))
      setError(`Could not delete: ${e.message}`)
    })
  }, [month])

  useEffect(() => {
    let cancelled = false
    api
      .getReview(month)
      .then((review) => {
        if (cancelled) return
        setNotes((prev) => mergeNotes(prev, review.notes))
        setLoaded(true)
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(`Could not load: ${e.message}`)
      })
    return () => {
      cancelled = true
      sendPendingDelete()
    }
  }, [month, loadAttempt, sendPendingDelete])

  async function handleAdd(input: { type: NoteType; text: string }) {
    try {
      const note = await api.addNote(month, input)
      setNotes((prev) => mergeNotes(prev, [note]))
      setError(null)
    } catch (e) {
      setError(`Could not add: ${(e as Error).message}`)
      throw e
    }
  }

  function handleDelete(note: Note) {
    sendPendingDelete()
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    pending.current = { note, timer: setTimeout(sendPendingDelete, UNDO_MS) }
    setPendingNote(note)
  }

  // The delete needs the ID token, so send it while still signed in rather
  // than leaving it to the unmount flush, which runs after sign-out.
  async function handleSignOut() {
    await sendPendingDelete()
    await signOut(auth)
  }

  function handleUndo() {
    const current = pending.current
    if (!current) return
    clearTimeout(current.timer)
    pending.current = null
    setPendingNote(null)
    setNotes((prev) => mergeNotes(prev, [current.note]))
  }

  function handleRetry() {
    setLoadError(null)
    setLoadAttempt((n) => n + 1)
  }

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onNavigate(shiftMonth(month, -1))}
            className="min-h-11 min-w-11 cursor-pointer text-2xl text-gray-600"
          >
            ‹
          </button>
          <h1 className="m-0 text-lg font-semibold">{formatMonth(month)}</h1>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onNavigate(shiftMonth(month, 1))}
            className="min-h-11 min-w-11 cursor-pointer text-2xl text-gray-600"
          >
            ›
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-44">
        {loadError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-4 rounded-lg bg-red-50 py-1 pr-1 pl-4 text-sm text-red-700"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="min-h-11 cursor-pointer rounded-lg px-4 font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loaded
          ? !loadError && <p className="text-sm text-gray-500">Loading…</p>
          : SECTIONS.map(({ type, title }) => {
              const items = notes.filter((n) => n.type === type)
              return (
                <section key={type} aria-labelledby={`section-${type}`} className="mb-6">
                  <h2
                    id={`section-${type}`}
                    className="mb-2 px-1 text-xs font-semibold tracking-wider text-gray-500 uppercase"
                  >
                    {title}
                  </h2>
                  {items.length === 0 ? (
                    <p className="px-1 text-sm text-gray-400">Nothing yet</p>
                  ) : (
                    <ul className="m-0 list-none overflow-hidden rounded-xl bg-white p-0 shadow-sm">
                      {items.map((note) => (
                        <NoteRow key={note.id} note={note} onDelete={() => handleDelete(note)} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSignOut}
            className="min-h-11 cursor-pointer px-2 text-sm text-gray-500"
          >
            Sign out
          </button>
        </div>
      </main>

      {pendingNote && (
        // Sits just above the Composer, which is lifted by the same keyboard inset.
        <div
          role="status"
          style={{ '--keyboard-inset': `${keyboardInset}px` } as CSSProperties}
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+7.5rem+var(--keyboard-inset))] z-20 flex justify-center px-4"
        >
          <div className="flex items-center gap-4 rounded-full bg-gray-900 py-1 pr-1 pl-5 text-sm text-white shadow-lg">
            <span>Deleted</span>
            <button
              type="button"
              onClick={handleUndo}
              className="min-h-10 cursor-pointer rounded-full px-4 font-semibold text-yellow-300"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <Composer onAdd={handleAdd} />
    </div>
  )
}
