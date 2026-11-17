import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import Composer from './Composer'
import type { Note } from '../notes'

const NOV_2026 = { year: 2026, month: 11 }
const trip: Note = {
  id: 'n1',
  type: 'learn',
  text: 'Trip',
  source: 'app',
  createdAt: '2026-11-01T00:00:00Z',
}
const run: Note = { ...trip, id: 'n2', type: 'event', text: 'Run' }

function composer(props: Partial<ComponentProps<typeof Composer>> = {}) {
  return (
    <Composer
      onAdd={vi.fn()}
      editing={null}
      month={NOV_2026}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  )
}

const LAST_TYPE_KEY = 'owlet.lastNoteType'

function type(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'New note' }), { target: { value: text } })
}

describe('Composer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to event', () => {
    render(composer())
    expect(screen.getByRole('button', { name: 'event' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'learn' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('submits the trimmed text with the chosen type, then clears and refocuses', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(composer({ onAdd }))
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
    render(composer({ onAdd }))
    type('Trip')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    type('Next thought')

    await act(async () => finishAdd())

    expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue('Next thought')
  })

  it('submits on Enter', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(composer({ onAdd }))
    type('Trip')
    fireEvent.submit(screen.getByRole('textbox', { name: 'New note' }))
    expect(onAdd).toHaveBeenCalledWith({ type: 'event', text: 'Trip' })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue(''))
  })

  it('uses a textarea for new notes', () => {
    render(composer())
    const input = screen.getByRole('textbox', { name: 'New note' })
    expect(input.tagName).toBe('TEXTAREA')
    expect(input).toHaveAttribute('rows', '1')
    expect(input).toHaveAttribute('maxlength', '500')
    expect(input).toHaveAttribute('enterkeyhint', 'enter')
    expect(input).toHaveAttribute('placeholder', 'Note…')
    expect(input).toHaveClass('text-base')
  })

  it('Return inserts a line break, it does not submit', () => {
    const onAdd = vi.fn()
    render(composer({ onAdd }))
    type('Trip')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New note' }), { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('submits multi-line text', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(composer({ onAdd }))
    type('  Trip\n- day 1  ')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(onAdd).toHaveBeenCalledWith({ type: 'event', text: 'Trip\n- day 1' })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue(''))
  })

  it.each(['metaKey', 'ctrlKey'])('%s+Return submits', async (modifier) => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(composer({ onAdd }))
    type('Trip')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New note' }), {
      key: 'Enter',
      [modifier]: true,
    })
    expect(onAdd).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue(''))
  })

  it('⌘+Return during an IME composition does not submit', () => {
    const onAdd = vi.fn()
    render(composer({ onAdd }))
    type('Trip')
    const input = screen.getByRole('textbox', { name: 'New note' })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true, isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true, keyCode: 229 })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('Save, Cancel and ➤ stay at the bottom of the box', () => {
    render(composer())
    expect(screen.getByRole('textbox', { name: 'New note' }).parentElement).toHaveClass('items-end')
  })

  it('re-measures the box when switching between adding and editing', () => {
    // jsdom has no layout: give the box 24px lines and a scrollHeight of one line per row of text.
    const sheet = document.createElement('style')
    sheet.textContent = 'textarea { line-height: 24px; padding: 8px 0; }'
    document.head.append(sheet)
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return this.value.split('\n').length * 24 + 16
      },
    })
    try {
      const { rerender } = render(composer())
      type('a\nb\nc')
      const newBox = () => screen.getByRole('textbox', { name: 'New note' })
      expect(newBox().style.height).toBe('90px')

      rerender(composer({ editing: trip }))
      expect(screen.getByRole('textbox', { name: 'Edit note' }).style.height).toBe('42px')

      rerender(composer())
      expect(newBox().style.height).toBe('90px')
    } finally {
      Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'scrollHeight')
      sheet.remove()
    }
  })

  it('ignores blank text', () => {
    const onAdd = vi.fn()
    render(composer({ onAdd }))
    type('   ')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps the text when adding fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('API error: 500'))
    render(composer({ onAdd }))
    type('Trip')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add note' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue('Trip')
  })

  it('remembers the last used type', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(composer({ onAdd }))
    fireEvent.click(screen.getByRole('button', { name: 'next' }))
    type('Run')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(localStorage.getItem(LAST_TYPE_KEY)).toBe('next'))
    unmount()

    render(composer({ onAdd }))
    expect(screen.getByRole('button', { name: 'next' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores an unknown stored type', () => {
    localStorage.setItem(LAST_TYPE_KEY, 'idea')
    render(composer())
    expect(screen.getByRole('button', { name: 'event' })).toHaveAttribute('aria-pressed', 'true')
  })

  describe('character counter', () => {
    it('shows no counter up to 400 characters', () => {
      render(composer())
      type('x'.repeat(400))
      expect(screen.queryByText('400/500')).not.toBeInTheDocument()
    })

    it('shows the counter past 400, counting line breaks', () => {
      render(composer())
      type('x'.repeat(400) + '\n')
      const counter = screen.getByText('401/500')
      expect(screen.getByRole('textbox', { name: 'New note' })).toHaveAttribute(
        'aria-describedby',
        counter.id,
      )
    })

    it('the counter is not a live region', () => {
      render(composer())
      type('x'.repeat(401))
      const counter = screen.getByText('401/500')
      expect(counter).not.toHaveAttribute('aria-live')
      expect(counter).not.toHaveAttribute('role', 'status')
    })
  })

  describe('editing', () => {
    function edit(props: Partial<ComponentProps<typeof Composer>> = {}) {
      return composer({ editing: trip, ...props })
    }
    const textbox = () => screen.getByRole('textbox', { name: 'Edit note' })
    const monthInput = () => screen.getByLabelText('Month')

    it('shows the note to edit', () => {
      render(edit())
      expect(screen.getByText('Editing')).toBeInTheDocument()
      expect(textbox()).toHaveValue('Trip')
      expect(screen.getByRole('button', { name: 'learn' })).toHaveAttribute('aria-pressed', 'true')
      expect(monthInput()).toHaveValue('2026-11')
      expect(monthInput()).toHaveAttribute('min', '2000-01')
      expect(monthInput()).toHaveAttribute('max', '2100-12')
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument()
    })

    it('shows the counter in Edit mode', () => {
      render(edit())
      fireEvent.change(textbox(), { target: { value: 'y'.repeat(450) } })
      expect(screen.getByText('450/500')).toBeInTheDocument()
    })

    it('Save sends the trimmed text, type and month', () => {
      const onSave = vi.fn()
      render(edit({ onSave }))
      fireEvent.change(textbox(), { target: { value: ' Trip! ' } })
      fireEvent.click(screen.getByRole('button', { name: 'next' }))
      fireEvent.change(monthInput(), { target: { value: '2026-12' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(onSave).toHaveBeenCalledWith({
        type: 'next',
        text: 'Trip!',
        month: { year: 2026, month: 12 },
      })
    })

    it('⌘+Return saves', () => {
      const onSave = vi.fn()
      render(edit({ onSave }))
      fireEvent.keyDown(textbox(), { key: 'Enter', metaKey: true })
      expect(onSave).toHaveBeenCalled()
    })

    it('Return in Edit note does not save', () => {
      const onSave = vi.fn()
      render(edit({ onSave }))
      fireEvent.keyDown(textbox(), { key: 'Enter' })
      expect(onSave).not.toHaveBeenCalled()
    })

    it("Edit note is a textarea with the note's line breaks", () => {
      render(edit({ editing: { ...trip, text: 'a\nb' } }))
      expect(textbox().tagName).toBe('TEXTAREA')
      expect(textbox()).toHaveValue('a\nb')
    })

    it('Escape and Cancel cancel', () => {
      const onSave = vi.fn()
      const onCancel = vi.fn()
      render(edit({ onSave, onCancel }))
      fireEvent.keyDown(textbox(), { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancel).toHaveBeenCalledTimes(2)
      expect(onSave).not.toHaveBeenCalled()
    })

    it('Escape during an IME composition does not cancel', () => {
      const onCancel = vi.fn()
      render(edit({ onCancel }))
      fireEvent.keyDown(textbox(), { key: 'Escape', isComposing: true })
      expect(onCancel).not.toHaveBeenCalled()
      expect(textbox()).toBeInTheDocument()
    })

    it('focuses the text when editing starts or switches note', () => {
      const { rerender } = render(composer())
      rerender(edit())
      expect(textbox()).toHaveFocus()
      screen.getByRole('button', { name: 'Cancel' }).focus()
      rerender(edit({ editing: run }))
      expect(textbox()).toHaveFocus()
    })

    it("can't save empty text or a cleared month", () => {
      const onSave = vi.fn()
      render(edit({ onSave }))
      fireEvent.change(textbox(), { target: { value: '   ' } })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      fireEvent.submit(textbox())
      expect(onSave).not.toHaveBeenCalled()

      fireEvent.change(textbox(), { target: { value: 'Trip' } })
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
      fireEvent.change(monthInput(), { target: { value: '' } })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      fireEvent.submit(textbox())
      expect(onSave).not.toHaveBeenCalled()
    })

    it('keeps the new-note draft for after editing', () => {
      const { rerender } = render(composer())
      type('draft')
      rerender(edit())
      rerender(composer())
      expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue('draft')
    })

    it('switching to another note loads it', () => {
      const { rerender } = render(edit())
      fireEvent.change(textbox(), { target: { value: 'changed' } })
      rerender(edit({ editing: run }))
      expect(textbox()).toHaveValue('Run')
      expect(screen.getByRole('button', { name: 'event' })).toHaveAttribute('aria-pressed', 'true')
    })

    it("an edit doesn't change the remembered type", () => {
      localStorage.setItem(LAST_TYPE_KEY, 'event')
      render(edit())
      fireEvent.click(screen.getByRole('button', { name: 'next' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(localStorage.getItem(LAST_TYPE_KEY)).toBe('event')
    })
  })
})
