import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { api } from '../api'
import type { NoteUpdate } from '../api'
import { formatMonth, formatShortMonth, shiftMonth } from '../month'
import type { YearMonth } from '../month'
import { applyRefresh, mergeNotes, replaceNote } from '../notes'
import type { Note, NoteType } from '../notes'
import Composer from '../components/Composer'
import NoteRow from '../components/NoteRow'
import { useKeyboardInset } from '../useKeyboardInset'
import { usePullToRefresh } from '../usePullToRefresh'
import { useRefreshOnReturn } from '../useRefreshOnReturn'

const UNDO_MS = 5000

const AUTO_REFRESH_MIN_MS = 30_000

const REFRESHING_HEIGHT = 48

const DEFAULT_COMPOSER_HEIGHT = 112

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

export default function MonthPage({ month, onNavigate }: MonthPageProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pendingNote, setPendingNote] = useState<Note | null>(null)
  const pending = useRef<{ note: Note; timer: ReturnType<typeof setTimeout> } | null>(null)
  const sendingDeletes = useRef(new Map<string, { note: Note }>())
  const [editing, setEditing] = useState<Note | null>(null)
  const savingEdits = useRef(new Map<string, { previous: Note; moving: boolean }>())
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyboardInset = useKeyboardInset()
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const lastLoadStartedAt = useRef(0)
  const localChanges = useRef<{
    added: Set<string>
    deleted: Set<string>
    edited: Set<string>
  } | null>(null)
  const mounted = useRef(true)
  const mainRef = useRef<HTMLElement>(null)

  const sendPendingDelete = useCallback((): Promise<void> => {
    const current = pending.current
    if (!current) return Promise.resolve()
    clearTimeout(current.timer)
    pending.current = null
    setPendingNote(null)
    const id = current.note.id
    sendingDeletes.current.set(id, current)
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
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
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
    const deleted = new Set(sendingDeletes.current.keys())
    if (pending.current) deleted.add(pending.current.note.id)
    const edited = new Set<string>()
    for (const [id, { moving }] of savingEdits.current) (moving ? deleted : edited).add(id)
    const local = { added: new Set<string>(), deleted, edited }
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

  useRefreshOnReturn(() => {
    if (!loaded || Date.now() - lastLoadStartedAt.current < AUTO_REFRESH_MIN_MS) return
    refresh()
  })

  const pull = usePullToRefresh(mainRef, { onRefresh: refresh, enabled: loaded, refreshing })

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

  function showNotice(message: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = setTimeout(() => setNotice(null), UNDO_MS)
  }

  function setSaving(id: string, saving: { previous: Note; moving: boolean } | null) {
    if (saving) savingEdits.current.set(id, saving)
    else savingEdits.current.delete(id)
    setSavingIds(new Set(savingEdits.current.keys()))
  }

  function deletingCopy(id: string): { note: Note } | undefined {
    return pending.current?.note.id === id ? pending.current : sendingDeletes.current.get(id)
  }

  function handleSave(input: { type: NoteType; text: string; month: YearMonth }) {
    if (!editing) return
    const previous = notes.find((n) => n.id === editing.id) ?? editing
    const id = previous.id
    const moving = input.month.year !== month.year || input.month.month !== month.month
    const update: NoteUpdate = {}
    if (input.type !== editing.type) update.type = input.type
    if (input.text !== editing.text) update.text = input.text
    if (moving) update.moveTo = input.month
    setEditing(null)
    if (Object.keys(update).length === 0) return

    if (moving) {
      localChanges.current?.deleted.add(id)
      setNotes((prev) => prev.filter((n) => n.id !== id))
    } else {
      localChanges.current?.edited.add(id)
      setNotes((prev) => replaceNote(prev, { ...previous, ...update }))
    }
    setSaving(id, { previous, moving })

    api
      .updateNote(month, id, update)
      .then((saved) => {
        if (!mounted.current) return
        if (moving) {
          showNotice(`Saved and moved to ${formatShortMonth(input.month)}`)
        } else {
          setNotes((prev) => replaceNote(prev, saved))
          const deleting = deletingCopy(id)
          if (deleting) deleting.note = saved
        }
        setError(null)
      })
      .catch((e: Error) => {
        if (!mounted.current) return
        if (e.message === 'API error: 404') {
          localChanges.current?.deleted.add(id)
          setNotes((prev) => prev.filter((n) => n.id !== id))
          if (pending.current?.note.id === id) {
            clearTimeout(pending.current.timer)
            pending.current = null
            setPendingNote(null)
          }
          setError('Could not save: the note no longer exists')
          return
        }
        const deleting = deletingCopy(id)
        if (deleting) {
          deleting.note = previous
        } else if (moving) {
          localChanges.current?.deleted.delete(id)
          setNotes((prev) => mergeNotes(prev, [previous]))
        } else {
          setNotes((prev) => replaceNote(prev, previous))
        }
        setError(`Could not save: ${e.message}`)
      })
      .finally(() => {
        if (mounted.current) setSaving(id, null)
        else savingEdits.current.delete(id)
      })
  }

  function handleDelete(note: Note) {
    if (editing?.id === note.id) setEditing(null)
    sendPendingDelete()
    localChanges.current?.deleted.add(note.id)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    pending.current = { note, timer: setTimeout(sendPendingDelete, UNDO_MS) }
    setPendingNote(note)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(null)
  }

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

      <main
        ref={mainRef}
        className="mx-auto max-w-2xl px-4 pt-4"
        style={{ paddingBottom: `calc(${composerHeight}px + 4rem)` }}
      >
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
                        <NoteRow
                          key={note.id}
                          note={note}
                          onDelete={() => handleDelete(note)}
                          onEdit={() => setEditing((cur) => (cur?.id === note.id ? cur : note))}
                          editing={editing?.id === note.id}
                          editDisabled={savingIds.has(note.id)}
                        />
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

      {(pendingNote || notice) && (
        <div
          role="status"
          style={
            {
              '--composer-height': `${composerHeight}px`,
              '--keyboard-inset': `${keyboardInset}px`,
            } as CSSProperties
          }
          className="fixed inset-x-0 bottom-[calc(var(--composer-height)+0.5rem+var(--keyboard-inset))] z-20 flex justify-center px-4"
        >
          {pendingNote ? (
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
          ) : (
            <div className="rounded-full bg-gray-900 px-5 py-3 text-sm text-white shadow-lg">
              {notice}
            </div>
          )}
        </div>
      )}

      <Composer
        onAdd={handleAdd}
        editing={editing}
        month={month}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
        onHeightChange={setComposerHeight}
      />
    </div>
  )
}
