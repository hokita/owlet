import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NoteRow from './NoteRow'

const note = {
  id: 'n1',
  type: 'event' as const,
  text: 'Trip',
  source: 'app' as const,
  createdAt: '2026-11-14T00:00:00.000Z',
}

function swipe(el: HTMLElement, from: number, to: number, y = 0) {
  fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 0 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: to, clientY: y }] })
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: y }] })
}

describe('NoteRow', () => {
  it('shows the note text', () => {
    render(<NoteRow note={note} onDelete={vi.fn()} />)
    expect(screen.getByText('Trip')).toBeInTheDocument()
  })

  it('marks notes added by an agent', () => {
    render(<NoteRow note={{ ...note, source: 'api' }} onDelete={vi.fn()} />)
    expect(screen.getByLabelText('Added by an agent')).toHaveTextContent('agent')
  })

  it('has no agent mark on app notes', () => {
    render(<NoteRow note={note} onDelete={vi.fn()} />)
    expect(screen.queryByLabelText('Added by an agent')).not.toBeInTheDocument()
  })

  it('deletes on a long swipe left', () => {
    const onDelete = vi.fn()
    render(<NoteRow note={note} onDelete={onDelete} />)
    swipe(screen.getByText('Trip'), 300, 150)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('snaps back on a short swipe', () => {
    const onDelete = vi.fn()
    render(<NoteRow note={note} onDelete={onDelete} />)
    const row = screen.getByText('Trip')
    swipe(row, 300, 260)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByTestId('note-row-content').style.transform).toBe('translateX(0px)')
  })

  it('does not delete when a long swipe is canceled, and snaps back', () => {
    const onDelete = vi.fn()
    render(<NoteRow note={note} onDelete={onDelete} />)
    const row = screen.getByText('Trip')
    fireEvent.touchStart(row, { touches: [{ clientX: 300, clientY: 0 }] })
    fireEvent.touchMove(row, { touches: [{ clientX: 150, clientY: 0 }] })
    fireEvent.touchCancel(row, { changedTouches: [{ clientX: 150, clientY: 0 }] })

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByTestId('note-row-content').style.transform).toBe('translateX(0px)')
  })

  it('ignores a swipe right', () => {
    const onDelete = vi.fn()
    render(<NoteRow note={note} onDelete={onDelete} />)
    swipe(screen.getByText('Trip'), 100, 300)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('ignores a mostly vertical drag (scrolling)', () => {
    const onDelete = vi.fn()
    render(<NoteRow note={note} onDelete={onDelete} />)
    swipe(screen.getByText('Trip'), 300, 150, 400)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes from the Delete button', () => {
    const onDelete = vi.fn()
    render(<NoteRow note={note} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
