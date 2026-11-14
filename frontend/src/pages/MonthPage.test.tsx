import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

const { mockSignOut, mockApi } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockApi: { getReview: vi.fn(), addNote: vi.fn(), deleteNote: vi.fn() },
}))

vi.mock('firebase/auth', () => ({ signOut: mockSignOut }))
vi.mock('../firebase', () => ({ auth: { name: 'auth' } }))
vi.mock('../api', () => ({ api: mockApi }))

import MonthPage from './MonthPage'

const november = { year: 2026, month: 11 }
const trip = { id: 'n1', type: 'event', text: 'Trip', createdAt: '2026-11-01T00:00:00.000Z' }
const firestore = {
  id: 'n2',
  type: 'learn',
  text: 'Firestore',
  createdAt: '2026-11-02T00:00:00.000Z',
}
const run = { id: 'n3', type: 'event', text: 'Run', createdAt: '2026-11-03T00:00:00.000Z' }

function section(name: string) {
  return screen.getByRole('region', { name })
}

async function renderLoaded(notes = [trip, firestore, run], onNavigate = vi.fn()) {
  mockApi.getReview.mockResolvedValue({ ...november, notes })
  const view = render(<MonthPage month={november} onNavigate={onNavigate} />)
  await screen.findByRole('region', { name: 'Events' })
  return view
}

function addNote(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'New note' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
}

describe('MonthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApi.deleteNote.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the month and its notes grouped by type', async () => {
    await renderLoaded()
    expect(mockApi.getReview).toHaveBeenCalledWith(november)
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
    const events = within(section('Events')).getAllByRole('listitem')
    expect(events.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Trip'),
      expect.stringContaining('Run'),
    ])
    expect(within(section('Learns')).getByText('Firestore')).toBeInTheDocument()
    expect(within(section('Nexts')).getByText('Nothing yet')).toBeInTheDocument()
  })

  it('shows an error when loading fails', async () => {
    mockApi.getReview.mockRejectedValue(new Error('API error: 401'))
    render(<MonthPage month={november} onNavigate={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load: API error: 401')
  })

  it('goes to the previous and next month', async () => {
    const onNavigate = vi.fn()
    await renderLoaded([], onNavigate)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onNavigate).toHaveBeenCalledWith({ year: 2026, month: 10 })
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onNavigate).toHaveBeenCalledWith({ year: 2026, month: 12 })
  })

  it('adds a note to its section', async () => {
    await renderLoaded([])
    const next = { id: 'n4', type: 'next', text: 'Read', createdAt: '2026-11-04T00:00:00.000Z' }
    mockApi.addNote.mockResolvedValue(next)
    fireEvent.click(screen.getByRole('button', { name: 'next' }))
    addNote('Read')
    expect(await within(section('Nexts')).findByText('Read')).toBeInTheDocument()
    expect(mockApi.addNote).toHaveBeenCalledWith(november, { type: 'next', text: 'Read' })
  })

  it('shows an error when adding fails', async () => {
    await renderLoaded([])
    mockApi.addNote.mockRejectedValue(new Error('API error: 500'))
    addNote('Read')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add: API error: 500')
  })

  describe('deleting', () => {
    it('removes the row, offers Undo, and deletes after 5 seconds', async () => {
      await renderLoaded()
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))

      expect(screen.queryByText('Trip')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Deleted')
      expect(mockApi.deleteNote).not.toHaveBeenCalled()

      await act(async () => vi.advanceTimersByTime(5000))
      expect(mockApi.deleteNote).toHaveBeenCalledWith(november, 'n1')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('Undo puts the row back in place and never deletes', async () => {
      await renderLoaded()
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

      const events = within(section('Events')).getAllByRole('listitem')
      expect(events[0]).toHaveTextContent('Trip')
      await act(async () => vi.advanceTimersByTime(10000))
      expect(mockApi.deleteNote).not.toHaveBeenCalled()
    })

    it('a second delete sends the first one right away', async () => {
      await renderLoaded()
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Run"' }))
      expect(mockApi.deleteNote).toHaveBeenCalledWith(november, 'n1')
      expect(mockApi.deleteNote).not.toHaveBeenCalledWith(november, 'n3')
    })

    it('leaving the month sends the pending delete', async () => {
      const { unmount } = await renderLoaded()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      unmount()
      expect(mockApi.deleteNote).toHaveBeenCalledWith(november, 'n1')
    })

    it('restores the row and shows an error when the delete fails', async () => {
      await renderLoaded()
      mockApi.deleteNote.mockRejectedValue(new Error('API error: 500'))
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      await act(async () => vi.advanceTimersByTime(5000))

      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Could not delete: API error: 500')
    })
  })

  it('signs out through Firebase', async () => {
    await renderLoaded([])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalledWith({ name: 'auth' })
  })
})
