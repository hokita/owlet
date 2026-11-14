import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { NOTE_TYPES } from '../notes'
import type { NoteType } from '../notes'
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
}

export default function Composer({ onAdd }: ComposerProps) {
  const [type, setType] = useState<NoteType>(loadLastType)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const keyboardInset = useKeyboardInset()

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
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

  return (
    <form
      onSubmit={handleSubmit}
      style={{ bottom: keyboardInset }}
      className="fixed inset-x-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 pt-2 pb-2">
        <div className="flex gap-2">
          {NOTE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`min-h-9 cursor-pointer rounded-full border px-4 text-sm ${
                type === t
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>
    </form>
  )
}
