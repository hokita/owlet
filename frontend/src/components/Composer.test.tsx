import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import Composer from './Composer'

const LAST_TYPE_KEY = 'owlet.lastNoteType'

function type(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'New note' }), { target: { value: text } })
}

describe('Composer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to event', () => {
    render(<Composer onAdd={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'event' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'learn' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('submits the trimmed text with the chosen type, then clears and refocuses', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<Composer onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'learn' }))
    type('  Firestore  ')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

    expect(onAdd).toHaveBeenCalledWith({ type: 'learn', text: 'Firestore' })
    const input = screen.getByRole('textbox', { name: 'New note' })
    await waitFor(() => expect(input).toHaveValue(''))
    expect(input).toHaveFocus()
  })

  it('keeps text typed while the previous note was sending', async () => {
    let finishAdd: () => void = () => {}
    const onAdd = vi.fn(() => new Promise<void>((resolve) => (finishAdd = resolve)))
    render(<Composer onAdd={onAdd} />)
    type('Trip')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    type('Next thought')

    await act(async () => finishAdd())

    expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue('Next thought')
  })

  it('submits on Enter', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<Composer onAdd={onAdd} />)
    type('Trip')
    fireEvent.submit(screen.getByRole('textbox', { name: 'New note' }))
    expect(onAdd).toHaveBeenCalledWith({ type: 'event', text: 'Trip' })
  })

  it('ignores blank text', () => {
    const onAdd = vi.fn()
    render(<Composer onAdd={onAdd} />)
    type('   ')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps the text when adding fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('API error: 500'))
    render(<Composer onAdd={onAdd} />)
    type('Trip')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue('Trip')
  })

  it('remembers the last used type', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(<Composer onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'next' }))
    type('Run')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(localStorage.getItem(LAST_TYPE_KEY)).toBe('next'))
    unmount()

    render(<Composer onAdd={onAdd} />)
    expect(screen.getByRole('button', { name: 'next' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores an unknown stored type', () => {
    localStorage.setItem(LAST_TYPE_KEY, 'idea')
    render(<Composer onAdd={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'event' })).toHaveAttribute('aria-pressed', 'true')
  })
})
