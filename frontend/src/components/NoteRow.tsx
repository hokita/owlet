import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import type { Note } from '../notes'

// How far left (px) a swipe must travel before letting go deletes the note.
const DELETE_THRESHOLD = 100

interface NoteRowProps {
  note: Note
  onDelete: () => void
}

export default function NoteRow({ note, onDelete }: NoteRowProps) {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  // Decided on the first real movement: a horizontal drag swipes the row, a
  // vertical one is page scrolling and is left alone.
  const direction = useRef<'horizontal' | 'vertical' | null>(null)

  function handleTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
    direction.current = null
  }

  function handleTouchMove(e: TouchEvent) {
    if (!start.current) return
    const t = e.touches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    if (direction.current === null && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      direction.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    }
    if (direction.current === 'horizontal') setOffset(Math.min(0, dx))
  }

  function resetGesture() {
    start.current = null
    direction.current = null
    setOffset(0)
  }

  function handleTouchEnd() {
    const shouldDelete = direction.current === 'horizontal' && offset <= -DELETE_THRESHOLD
    resetGesture()
    if (shouldDelete) onDelete()
  }

  return (
    <li className="group relative overflow-hidden border-b border-gray-100 last:border-b-0">
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-end bg-red-500 px-4 text-sm font-medium text-white"
      >
        Delete
      </div>
      <div
        data-testid="note-row-content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        // A canceled gesture (system interrupt, incoming call) is not a finished
        // swipe, so it never deletes.
        onTouchCancel={resetGesture}
        style={{ transform: `translateX(${offset}px)` }}
        className={`relative flex min-h-11 items-center gap-2 bg-white px-4 py-2 touch-pan-y ${
          offset === 0 ? 'transition-transform duration-200' : ''
        }`}
      >
        <span className="min-w-0 flex-1 text-base wrap-anywhere">{note.text}</span>
        {/* On touch-only devices the swipe is the visible way to delete, but the
            swipe is raw touch that screen readers can't perform, so the button
            stays in the accessibility tree (sr-only) and shows when focused. */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete "${note.text}"`}
          className="shrink-0 cursor-pointer rounded px-2 py-1 text-sm text-red-600 opacity-0 hover:bg-red-50 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:sr-only [@media(hover:none)]:focus:not-sr-only [@media(hover:none)]:focus:opacity-100"
        >
          Delete
        </button>
      </div>
    </li>
  )
}
