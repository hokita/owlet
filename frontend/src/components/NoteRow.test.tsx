import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
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

function renderRow(props: Partial<ComponentProps<typeof NoteRow>> = {}) {
  const onDelete = vi.fn()
  const onEdit = vi.fn()
  render(
    <NoteRow
      note={note}
      onDelete={onDelete}
      onEdit={onEdit}
      editing={false}
      editDisabled={false}
      {...props}
    />
  )
  return { onDelete, onEdit }
}

describe('NoteRow', () => {
  it('shows the note text', () => {
    renderRow()
    expect(screen.getByText('Trip')).toBeInTheDocument()
  })

  it("keeps the note's line breaks", () => {
    renderRow({ note: { ...note, text: 'Trip\n- day 1' } })
    const button = screen.getByRole('button', { name: /^Edit "Trip/ })
    expect(button.textContent).toBe('Trip\n- day 1')
    expect(button).toHaveClass('whitespace-pre-wrap')
    expect(button).toHaveClass('wrap-anywhere')
  })

  it('lines the badge and Delete up with the first line', () => {
    renderRow()
    expect(screen.getByTestId('note-row-content')).toHaveClass('items-start')
    expect(screen.getByTestId('note-row-content')).not.toHaveClass('items-center')
  })

  it('a multi-line note still deletes on a long swipe and opens on tap', () => {
    const { onDelete, onEdit } = renderRow({ note: { ...note, text: 'Trip\n- day 1' } })
    const content = screen.getByTestId('note-row-content')
    swipe(content, 300, 150)
    expect(onDelete).toHaveBeenCalledTimes(1)
    fireEvent.touchStart(content, { touches: [{ clientX: 200, clientY: 0 }] })
    fireEvent.touchEnd(content, { changedTouches: [{ clientX: 200, clientY: 0 }] })
    fireEvent.click(screen.getByRole('button', { name: /^Edit "Trip/ }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('marks notes added by an agent', () => {
    renderRow({ note: { ...note, source: 'api' } })
    expect(screen.getByLabelText('Added by an agent')).toHaveTextContent('agent')
  })

  it('has no agent mark on app notes', () => {
    renderRow()
    expect(screen.queryByLabelText('Added by an agent')).not.toBeInTheDocument()
  })

  it('deletes on a long swipe left', () => {
    const { onDelete } = renderRow()
    swipe(screen.getByText('Trip'), 300, 150)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('snaps back on a short swipe', () => {
    const { onDelete } = renderRow()
    const row = screen.getByText('Trip')
    swipe(row, 300, 260)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByTestId('note-row-content').style.transform).toBe('translateX(0px)')
  })

  it('does not delete when a long swipe is canceled, and snaps back', () => {
    const { onDelete } = renderRow()
    const row = screen.getByText('Trip')
    fireEvent.touchStart(row, { touches: [{ clientX: 300, clientY: 0 }] })
    fireEvent.touchMove(row, { touches: [{ clientX: 150, clientY: 0 }] })
    fireEvent.touchCancel(row, { changedTouches: [{ clientX: 150, clientY: 0 }] })

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByTestId('note-row-content').style.transform).toBe('translateX(0px)')
  })

  it('ignores a swipe right', () => {
    const { onDelete } = renderRow()
    swipe(screen.getByText('Trip'), 100, 300)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('ignores a mostly vertical drag (scrolling)', () => {
    const { onDelete } = renderRow()
    swipe(screen.getByText('Trip'), 300, 150, 400)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes from the Delete button', () => {
    const { onDelete } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('edits when the text is tapped', () => {
    const { onEdit, onDelete } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Edit "Trip"' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('does not edit when a swipe ends on the text', () => {
    const { onEdit } = renderRow()
    swipe(screen.getByTestId('note-row-content'), 200, 150)
    fireEvent.click(screen.getByRole('button', { name: 'Edit "Trip"' }))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('deletes but does not edit after a full swipe', () => {
    const { onEdit, onDelete } = renderRow()
    swipe(screen.getByTestId('note-row-content'), 300, 180)
    fireEvent.click(screen.getByRole('button', { name: 'Edit "Trip"' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('does not edit after a vertical drag', () => {
    const { onEdit } = renderRow()
    swipe(screen.getByTestId('note-row-content'), 200, 200, 40)
    fireEvent.click(screen.getByRole('button', { name: 'Edit "Trip"' }))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('edits again on a plain tap after a swipe', () => {
    const { onEdit } = renderRow()
    const content = screen.getByTestId('note-row-content')
    swipe(content, 200, 150)
    fireEvent.touchStart(content, { touches: [{ clientX: 200, clientY: 0 }] })
    fireEvent.touchEnd(content, { changedTouches: [{ clientX: 200, clientY: 0 }] })
    fireEvent.click(screen.getByRole('button', { name: 'Edit "Trip"' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('highlights the note being edited', () => {
    renderRow({ editing: true })
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-current', 'true')
  })

  it("can't be edited while its save is in flight", () => {
    renderRow({ editDisabled: true })
    expect(screen.getByRole('button', { name: 'Edit "Trip"' })).toBeDisabled()
  })
})
