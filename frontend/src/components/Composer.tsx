import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MONTH_INPUT_MAX, MONTH_INPUT_MIN, parseMonthInput, toMonthInput } from '../month'
import type { YearMonth } from '../month'
import { NOTE_TYPES } from '../notes'
import type { Note, NoteType } from '../notes'
import { useKeyboardInset } from '../useKeyboardInset'

const LAST_TYPE_KEY = 'owlet.lastNoteType'

// localStorage can throw (private mode, blocked storage); the last-used type is
// only a convenience, so fall back silently.
function loadLastType(): NoteType {
  try {
    const stored = localStorage.getItem(LAST_TYPE_KEY)
    if ((NOTE_TYPES as readonly string[]).includes(stored ?? '')) return stored as NoteType
  } catch {
    // ignore
  }
  return 'event'
}

function saveLastType(type: NoteType) {
  try {
    localStorage.setItem(LAST_TYPE_KEY, type)
  } catch {
    // ignore
  }
}

interface ComposerProps {
  onAdd: (input: { type: NoteType; text: string }) => Promise<void>
  // The note being edited; while set, the bar edits it instead of adding.
  editing: Note | null
  // The month the edited note is in (the page's month).
  month: YearMonth
  onSave: (input: { type: NoteType; text: string; month: YearMonth }) => void
  onCancel: () => void
}

export default function Composer({ onAdd, editing, month, onSave, onCancel }: ComposerProps) {
  const [type, setType] = useState<NoteType>(loadLastType)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  // Edit fields are separate from the new-note draft, which survives an edit.
  const [editText, setEditText] = useState('')
  const [editType, setEditType] = useState<NoteType>('event')
  const [editMonth, setEditMonth] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const keyboardInset = useKeyboardInset()

  // Load the fields when another note (or none) is being edited.
  const editingId = editing?.id ?? null
  if (editingId !== loadedId) {
    setLoadedId(editingId)
    if (editing) {
      setEditText(editing.text)
      setEditType(editing.type)
      setEditMonth(toMonthInput(month))
    }
  }

  // Opening a note (or switching to another) puts the cursor in its text.
  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  const editedMonth = parseMonthInput(editMonth)
  const canSave = editText.trim() !== '' && editedMonth !== null

  function handleSave() {
    if (!canSave || !editedMonth) return
    onSave({ type: editType, text: editText.trim(), month: editedMonth })
  }

  function handleKeyDown(e: KeyboardEvent) {
    // While an IME is composing, Escape cancels the conversion, not the edit.
    if (editing && e.key === 'Escape' && !e.nativeEvent.isComposing) onCancel()
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (editing) {
      handleSave()
      return
    }
    const draft = text
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await onAdd({ type, text: trimmed })
      // Only clear what was sent: the input stays editable while sending, and
      // anything typed in the meantime is the next note.
      setText((current) => (current === draft ? '' : current))
      saveLastType(type)
    } catch {
      // The page shows the error; keep the text so it can be resent.
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const activeType = editing ? editType : type
  const setActiveType = editing ? setEditType : setType

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      style={{ bottom: keyboardInset }}
      className="fixed inset-x-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 pt-2 pb-2">
        {editing && <p className="text-xs text-gray-500">Editing</p>}
        <div className="flex gap-2">
          {NOTE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={activeType === t}
              onClick={() => setActiveType(t)}
              className={`min-h-9 cursor-pointer rounded-full border px-4 text-sm ${
                activeType === t
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
          {editing && (
            <input
              type="month"
              aria-label="Month"
              min={MONTH_INPUT_MIN}
              max={MONTH_INPUT_MAX}
              value={editMonth}
              onChange={(e) => setEditMonth(e.target.value)}
              className="ml-auto min-h-9 min-w-0 rounded-lg border border-gray-300 px-2 text-sm"
            />
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <input
                ref={editInputRef}
                type="text"
                aria-label="Edit note"
                enterKeyHint="done"
                maxLength={500}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-base"
              />
              <button
                type="button"
                onClick={onCancel}
                className="min-h-11 cursor-pointer rounded-lg border border-gray-300 px-3 text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="min-h-11 cursor-pointer rounded-lg bg-blue-600 px-4 text-white disabled:opacity-50"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <input
                ref={inputRef}
                type="text"
                aria-label="New note"
                placeholder="One-line note…"
                enterKeyHint="send"
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-base"
              />
              <button
                type="submit"
                aria-label="Add note"
                disabled={sending}
                className="min-h-11 min-w-11 cursor-pointer rounded-lg bg-blue-600 px-4 text-white disabled:opacity-50"
              >
                ➤
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  )
}
