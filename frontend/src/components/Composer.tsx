import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MONTH_INPUT_MAX, MONTH_INPUT_MIN, parseMonthInput, toMonthInput } from '../month'
import type { YearMonth } from '../month'
import { NOTE_TYPES } from '../notes'
import type { Note, NoteType } from '../notes'
import { useAutoGrow } from '../useAutoGrow'
import { useKeyboardInset } from '../useKeyboardInset'

const NOTE_MAX = 500
const COUNTER_FROM = 400

const LAST_TYPE_KEY = 'owlet.lastNoteType'

function readStoredType(): string | null {
  try {
    return localStorage.getItem(LAST_TYPE_KEY)
  } catch {
    return null
  }
}

function loadLastType(): NoteType {
  const stored = readStoredType()
  return (NOTE_TYPES as readonly string[]).includes(stored ?? '') ? (stored as NoteType) : 'event'
}

function saveLastType(type: NoteType): boolean {
  try {
    localStorage.setItem(LAST_TYPE_KEY, type)
    return true
  } catch {
    return false
  }
}

interface ComposerProps {
  onAdd: (input: { type: NoteType; text: string }) => Promise<void>
  editing: Note | null
  month: YearMonth
  onSave: (input: { type: NoteType; text: string; month: YearMonth }) => void
  onCancel: () => void
  onHeightChange?: (height: number) => void
}

export default function Composer({
  onAdd,
  editing,
  month,
  onSave,
  onCancel,
  onHeightChange,
}: ComposerProps) {
  const [type, setType] = useState<NoteType>(loadLastType)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editText, setEditText] = useState('')
  const [editType, setEditType] = useState<NoteType>('event')
  const [editMonth, setEditMonth] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const keyboardInset = useKeyboardInset()
  const counterId = useId()
  useAutoGrow(inputRef, text)
  useAutoGrow(editInputRef, editText)

  const editingId = editing?.id ?? null
  if (editingId !== loadedId) {
    setLoadedId(editingId)
    if (editing) {
      setEditText(editing.text)
      setEditType(editing.type)
      setEditMonth(toMonthInput(month))
    }
  }

  useEffect(() => {
    const form = formRef.current
    if (!form || !onHeightChange || typeof ResizeObserver === 'undefined') return
    onHeightChange(form.offsetHeight)
    const observer = new ResizeObserver(() => onHeightChange(form.offsetHeight))
    observer.observe(form)
    return () => observer.disconnect()
  }, [onHeightChange])

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
    if (editing && e.key === 'Escape' && !e.nativeEvent.isComposing) onCancel()
  }

  function handleTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
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
    const added = await (async () => onAdd({ type, text: trimmed }))().then(
      () => true,
      () => false
    )
    if (added) {
      setText((current) => (current === draft ? '' : current))
      saveLastType(type)
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const activeLength = (editing ? editText : text).length
  const showCounter = activeLength > COUNTER_FROM
  const describedBy = showCounter ? counterId : undefined

  const activeType = editing ? editType : type
  const setActiveType = editing ? setEditType : setType

  return (
    <form
      ref={formRef}
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
              className="ml-auto min-h-9 min-w-0 rounded-lg border border-gray-300 px-2 text-base"
            />
          )}
        </div>
        <div className="flex items-end gap-2">
          {editing ? (
            <>
              <textarea
                ref={editInputRef}
                rows={1}
                aria-label="Edit note"
                enterKeyHint="enter"
                maxLength={NOTE_MAX}
                aria-describedby={describedBy}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleTextKeyDown}
                className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-base leading-6"
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
              <textarea
                ref={inputRef}
                rows={1}
                aria-label="New note"
                placeholder="Note…"
                enterKeyHint="enter"
                maxLength={NOTE_MAX}
                aria-describedby={describedBy}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleTextKeyDown}
                className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-base leading-6"
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
        {showCounter && (
          <p id={counterId} className="text-right text-xs text-gray-500">
            {activeLength}/{NOTE_MAX}
          </p>
        )}
      </div>
    </form>
  )
}
