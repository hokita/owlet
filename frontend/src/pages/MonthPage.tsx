import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { api } from '../api'
import { formatMonth, shiftMonth } from '../month'
import type { YearMonth } from '../month'
import { applyRefresh, mergeNotes } from '../notes'
import type { Note, NoteType } from '../notes'
import Composer from '../components/Composer'
import NoteRow from '../components/NoteRow'
import { useKeyboardInset } from '../useKeyboardInset'
import { usePullToRefresh } from '../usePullToRefresh'
import { useRefreshOnReturn } from '../useRefreshOnReturn'

// How long a deleted note can be brought back before the delete is sent.
const UNDO_MS = 5000

// Coming back to the app refreshes only if the month was last fetched this long ago.
const AUTO_REFRESH_MIN_MS = 30_000

// Height (px) of the pull indicator while the spinner shows.
const REFRESHING_HEIGHT = 48

const REFRESH_FAILED = "Couldn't refresh. Pull to try again."

const SECTIONS: { type: NoteType; title: string }[] = [
  { type: 'event', title: 'Events' },
  { type: 'learn', title: 'Learns' },
  { type: 'next', title: 'Nexts' },
]

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
  // Ids whose delete has been sent but not answered yet.
  const sendingDeletes = useRef(new Set<string>())
  const keyboardInset = useKeyboardInset()
  // A refresh refetches the month without touching `loaded` or `loadError`,
  // and never clears the notes on screen, even when it fails.
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const lastLoadStartedAt = useRef(0)
  // Notes added or deleted here while a refresh is in flight, so its result
  // doesn't undo them. Null when no refresh is running.
  const localChanges = useRef<{ added: Set<string>; deleted: Set<string> } | null>(null)
  // A refresh still running when the month changes is ignored.
  const mounted = useRef(true)
  const mainRef = useRef<HTMLElement>(null)
  const pull = usePullToRefresh(mainRef, { onRefresh: refresh, enabled: loaded, refreshing })

  // Resolves once the delete request has settled (failures are handled here).
  const sendPendingDelete = useCallback((): Promise<void> => {
    const current = pending.current
    if (!current) return Promise.resolve()
    clearTimeout(current.timer)
    pending.current = null
    setPendingNote(null)
    const id = current.note.id
    sendingDeletes.current.add(id)
    return api
      .deleteNote(month, id)
      .catch((e: Error) => {
        localChanges.current?.deleted.delete(id)
        setNotes((prev) => mergeNotes(prev, [current.note]))
        setError(`Could not delete: ${e.message}`)
      })
      .finally(() => sendingDeletes.current.delete(id))
  }, [month])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    lastLoadStartedAt.current = Date.now()
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

  function refresh() {
    if (inFlight.current) return
    inFlight.current = true
    lastLoadStartedAt.current = Date.now()
    // A note waiting for its Undo, or whose delete is still being sent, counts
    // as deleted here: the server may answer before the delete lands.
    const deleted = new Set(sendingDeletes.current)
    if (pending.current) deleted.add(pending.current.note.id)
    const local = { added: new Set<string>(), deleted }
    localChanges.current = local
    setRefreshing(true)
    api
      .getReview(month)
      .then((review) => {
        if (!mounted.current) return
        setNotes((prev) => applyRefresh(prev, review.notes, local))
        setRefreshError(null)
      })
      .catch(() => {
        if (mounted.current) setRefreshError(REFRESH_FAILED)
      })
      .finally(() => {
        inFlight.current = false
        localChanges.current = null
        if (mounted.current) setRefreshing(false)
      })
  }

  // Skips quick hide/show flicker (the interval; `refresh()` itself skips a
  // return while a refresh is running) and a month that hasn't loaded yet.
  useRefreshOnReturn(() => {
    if (!loaded || Date.now() - lastLoadStartedAt.current < AUTO_REFRESH_MIN_MS) return
    refresh()
  })

  async function handleAdd(input: { type: NoteType; text: string }) {
    try {
      const note = await api.addNote(month, input)
      localChanges.current?.added.add(note.id)
      setNotes((prev) => mergeNotes(prev, [note]))
      setError(null)
    } catch (e) {
      setError(`Could not add: ${(e as Error).message}`)
      throw e
    }
  }

  function handleDelete(note: Note) {
    sendPendingDelete()
    localChanges.current?.deleted.add(note.id)
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
    localChanges.current?.deleted.delete(current.note.id)
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

      <main ref={mainRef} className="mx-auto max-w-2xl px-4 pt-4 pb-44">
        {/* Not role="status": the Undo toast owns that role. */}
        <div
          aria-live="polite"
          style={{ height: pull.state === 'refreshing' ? REFRESHING_HEIGHT : pull.distance }}
          className={`flex items-center justify-center gap-2 overflow-hidden text-sm text-gray-500 ${
            pull.state === 'pulling' || pull.state === 'armed'
              ? ''
              : 'transition-[height] duration-200'
          }`}
        >
          {pull.state === 'pulling' && 'Pull to refresh'}
          {pull.state === 'armed' && 'Release to refresh'}
          {pull.state === 'refreshing' && (
            <>
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
              />
              Refreshing…
            </>
          )}
        </div>

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

        {refreshError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {refreshError}
          </p>
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
