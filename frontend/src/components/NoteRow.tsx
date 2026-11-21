import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import type { Note } from '../notes'

const DELETE_THRESHOLD = 100

interface NoteRowProps {
  note: Note
  onDelete: () => void
  onEdit: () => void
  editing: boolean
  editDisabled: boolean
}

export default function NoteRow({ note, onDelete, onEdit, editing, editDisabled }: NoteRowProps) {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const direction = useRef<'horizontal' | 'vertical' | null>(null)
  const moved = useRef(false)

  function handleTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
    direction.current = null
    moved.current = false
  }

  function handleTouchMove(e: TouchEvent) {
    if (!start.current) return
    const t = e.touches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    if (direction.current === null && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      direction.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      moved.current = true
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

  function handleEditClick() {
    if (moved.current) return
    onEdit()
  }

  return (
    <li
      aria-current={editing ? 'true' : undefined}
      className="group relative overflow-hidden border-b border-gray-100 last:border-b-0"
    >
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
        onTouchCancel={resetGesture}
        style={{ transform: `translateX(${offset}px)` }}
        className={`relative flex min-h-11 items-start gap-2 px-4 py-2 touch-pan-y ${
          editing ? 'bg-blue-50' : 'bg-white'
        } ${offset === 0 ? 'transition-transform duration-200' : ''}`}
      >
        <button
          type="button"
          onClick={handleEditClick}
          disabled={editDisabled}
          aria-label={`Edit "${note.text}"`}
          className="min-w-0 flex-1 cursor-pointer rounded text-left text-base whitespace-pre-wrap wrap-anywhere focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {note.text}
        </button>
        {note.source === 'api' && (
          <span
            role="img"
            aria-label="Added by an agent"
            title="Added by an agent"
            className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
          >
            agent
          </span>
        )}
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
