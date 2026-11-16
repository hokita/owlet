import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

const { mockSignOut, mockApi } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockApi: { getReview: vi.fn(), addNote: vi.fn(), deleteNote: vi.fn() },
}))

vi.mock('firebase/auth', () => ({ signOut: mockSignOut }))
vi.mock('../firebase', () => ({ auth: { name: 'auth' } }))
vi.mock('../api', () => ({ api: mockApi }))

const { mockKeyboardInset } = vi.hoisted(() => ({ mockKeyboardInset: vi.fn(() => 0) }))
vi.mock('../useKeyboardInset', () => ({ useKeyboardInset: mockKeyboardInset }))

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
    mockKeyboardInset.mockReturnValue(0)
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

  describe('when loading fails', () => {
    const added = { id: 'n4', type: 'next', text: 'Read', createdAt: '2026-11-04T00:00:00.000Z' }

    async function renderFailedLoad() {
      mockApi.getReview.mockRejectedValueOnce(new Error('API error: 500'))
      render(<MonthPage month={november} onNavigate={vi.fn()} />)
      await screen.findByRole('button', { name: 'Retry' })
    }

    it('keeps the load error and shows no partial month after adding a note', async () => {
      await renderFailedLoad()
      mockApi.addNote.mockResolvedValue(added)
      addNote('Read')
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'New note' })).toHaveValue(''))

      expect(screen.getByRole('alert')).toHaveTextContent('Could not load: API error: 500')
      expect(screen.queryByRole('region', { name: 'Events' })).not.toBeInTheDocument()
      expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
    })

    it('Retry loads the month, including notes added meanwhile', async () => {
      await renderFailedLoad()
      mockApi.addNote.mockResolvedValue(added)
      addNote('Read')
      await waitFor(() => expect(mockApi.addNote).toHaveBeenCalled())

      mockApi.getReview.mockResolvedValueOnce({ ...november, notes: [trip, firestore] })
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      await screen.findByRole('region', { name: 'Events' })
      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
      expect(within(section('Learns')).getByText('Firestore')).toBeInTheDocument()
      expect(within(section('Nexts')).getByText('Read')).toBeInTheDocument()
      expect(mockApi.getReview).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
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

  describe('adding before the month has loaded', () => {
    const added = { id: 'n4', type: 'event', text: 'Early', createdAt: '2026-11-04T00:00:00.000Z' }

    // Both requests are held open so each test can choose which response lands first.
    function renderWithPendingRequests() {
      let resolveLoad: (review: unknown) => void = () => {}
      let resolveAdd: (note: unknown) => void = () => {}
      mockApi.getReview.mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)))
      mockApi.addNote.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)))
      render(<MonthPage month={november} onNavigate={vi.fn()} />)
      return {
        finishLoad: (notes: unknown[]) => act(async () => resolveLoad({ ...november, notes })),
        finishAdd: () => act(async () => resolveAdd(added)),
      }
    }

    it('shows the note once when the load lands first and already includes it', async () => {
      const { finishLoad, finishAdd } = renderWithPendingRequests()
      addNote('Early')
      await finishLoad([trip, added])
      await finishAdd()

      expect(within(section('Events')).getAllByText('Early')).toHaveLength(1)
      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
    })

    it('shows the note once when the add lands first and the load includes it', async () => {
      const { finishLoad, finishAdd } = renderWithPendingRequests()
      addNote('Early')
      await finishAdd()
      await finishLoad([trip, added])

      expect(within(section('Events')).getAllByText('Early')).toHaveLength(1)
      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
    })

    it('keeps the note when the load does not include it yet', async () => {
      const { finishLoad, finishAdd } = renderWithPendingRequests()
      addNote('Early')
      await finishAdd()
      await finishLoad([trip])

      expect(await within(section('Events')).findByText('Early')).toBeInTheDocument()
      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
    })
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

    it('lifts the Undo toast above the on-screen keyboard', async () => {
      mockKeyboardInset.mockReturnValue(300)
      await renderLoaded()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      expect(screen.getByRole('status').style.getPropertyValue('--keyboard-inset')).toBe('300px')
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

  it('sends a pending delete before signing out', async () => {
    await renderLoaded()
    let finishDelete: () => void = () => {}
    mockApi.deleteNote.mockReturnValue(new Promise<void>((resolve) => (finishDelete = resolve)))
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockApi.deleteNote).toHaveBeenCalledWith(november, 'n1')
    expect(mockSignOut).not.toHaveBeenCalled()

    await act(async () => finishDelete())
    expect(mockSignOut).toHaveBeenCalledWith({ name: 'auth' })
  })

  it('signs out through Firebase', async () => {
    await renderLoaded([])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ name: 'auth' }))
  })

  describe('pull to refresh', () => {
    const muse = {
      id: 'n5',
      type: 'learn',
      text: 'Muse note',
      source: 'api',
      createdAt: '2026-11-05T00:00:00.000Z',
    }
    const read = { id: 'n4', type: 'next', text: 'Read', createdAt: '2026-11-04T00:00:00.000Z' }

    const at = (y: number, x = 100) => ({ touches: [{ clientX: x, clientY: y }] })

    function startPull(dy: number) {
      const main = screen.getByRole('main')
      fireEvent.touchStart(main, at(100))
      fireEvent.touchMove(main, at(100 + dy))
    }

    function pull(dy: number) {
      startPull(dy)
      fireEvent.touchEnd(screen.getByRole('main'))
    }

    // Further getReview calls are held open until the test resolves them.
    function deferReview() {
      let resolve: (notes: unknown[]) => Promise<void> = async () => {}
      mockApi.getReview.mockReturnValue(
        new Promise((r) => {
          resolve = (notes) => act(async () => r({ ...november, notes }))
        })
      )
      return { resolve: (notes: unknown[]) => resolve(notes) }
    }

    it('shows Pull to refresh, then Release to refresh, while pulling', async () => {
      await renderLoaded()
      startPull(100)
      expect(screen.getByText('Pull to refresh')).toBeInTheDocument()
      fireEvent.touchMove(screen.getByRole('main'), at(300))
      expect(screen.getByText('Release to refresh')).toBeInTheDocument()
    })

    it('a pull past the threshold refetches and shows a new note with its agent badge', async () => {
      await renderLoaded()
      mockApi.getReview.mockResolvedValue({ ...november, notes: [trip, firestore, run, muse] })
      pull(200)

      const row = (await screen.findByText('Muse note')).closest('li')!
      expect(within(row).getByRole('img', { name: 'Added by an agent' })).toBeInTheDocument()
      expect(mockApi.getReview).toHaveBeenCalledTimes(2)
      expect(mockApi.getReview).toHaveBeenLastCalledWith(november)
    })

    it('shows Refreshing… while refetching', async () => {
      await renderLoaded()
      const review = deferReview()
      pull(200)
      expect(screen.getByText('Refreshing…')).toBeInTheDocument()

      await review.resolve([trip, firestore, run])
      expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument()
    })

    it("a short pull doesn't refetch", async () => {
      await renderLoaded()
      pull(100)
      expect(mockApi.getReview).toHaveBeenCalledTimes(1)
    })

    it('a refresh drops a note deleted elsewhere', async () => {
      await renderLoaded()
      mockApi.getReview.mockResolvedValue({ ...november, notes: [trip, run] })
      pull(200)
      await waitFor(() => expect(screen.queryByText('Firestore')).not.toBeInTheDocument())
      expect(screen.getByText('Trip')).toBeInTheDocument()
    })

    it('a failed refresh keeps the notes and says so', async () => {
      await renderLoaded()
      mockApi.getReview.mockRejectedValue(new Error('API error: 500'))
      pull(200)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't refresh. Pull to try again."
      )
      expect(screen.getByText('Trip')).toBeInTheDocument()
      expect(screen.getByText('Firestore')).toBeInTheDocument()
      expect(screen.getByText('Run')).toBeInTheDocument()
      expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument()
    })

    it('the next successful refresh clears the failure', async () => {
      await renderLoaded()
      mockApi.getReview.mockRejectedValue(new Error('API error: 500'))
      pull(200)
      await screen.findByRole('alert')

      mockApi.getReview.mockResolvedValue({ ...november, notes: [trip, firestore, run] })
      pull(200)
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
      expect(mockApi.getReview).toHaveBeenCalledTimes(3)
    })

    it('a note added during a refresh stays', async () => {
      await renderLoaded()
      const review = deferReview()
      pull(200)
      mockApi.addNote.mockResolvedValue(read)
      addNote('Read')
      expect(await screen.findByText('Read')).toBeInTheDocument()

      await review.resolve([trip, firestore, run])
      expect(within(section('Nexts')).getByText('Read')).toBeInTheDocument()
    })

    it('a note deleted during a refresh stays gone', async () => {
      await renderLoaded()
      const review = deferReview()
      pull(200)
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))

      await review.resolve([trip, firestore, run])
      expect(screen.queryByText('Trip')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Deleted')

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
    })

    it('a note deleted before a refresh, and sent during it, stays gone', async () => {
      await renderLoaded()
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      const review = deferReview()
      pull(200)
      // Deleting another note sends Trip's delete right away.
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Run"' }))
      expect(mockApi.deleteNote).toHaveBeenCalledWith(november, 'n1')

      await review.resolve([trip, firestore, run])
      expect(screen.queryByText('Trip')).not.toBeInTheDocument()
    })

    it('a delete that fails during a refresh brings the note back', async () => {
      await renderLoaded()
      mockApi.deleteNote.mockRejectedValue(new Error('API error: 500'))
      const review = deferReview()
      vi.useFakeTimers()
      pull(200)
      fireEvent.click(screen.getByRole('button', { name: 'Delete "Trip"' }))
      await act(async () => vi.advanceTimersByTime(5000))
      expect(mockApi.deleteNote).toHaveBeenCalledWith(november, 'n1')

      await review.resolve([trip, firestore, run])
      expect(within(section('Events')).getByText('Trip')).toBeInTheDocument()
    })

    it("pulling during a refresh doesn't start another", async () => {
      await renderLoaded()
      const review = deferReview()
      pull(200)
      pull(200)
      expect(mockApi.getReview).toHaveBeenCalledTimes(2)
      await review.resolve([trip, firestore, run])
    })

    it("a horizontal swipe on a note doesn't refresh", async () => {
      await renderLoaded()
      const row = screen.getAllByTestId('note-row-content')[0]
      fireEvent.touchStart(row, at(100, 300))
      fireEvent.touchMove(row, at(100, 150))
      fireEvent.touchEnd(row)
      expect(mockApi.getReview).toHaveBeenCalledTimes(1)
    })

    it('a refresh after the month changes is ignored', async () => {
      const consoleError = vi.spyOn(console, 'error')
      const { unmount } = await renderLoaded()
      const review = deferReview()
      pull(200)
      unmount()

      await expect(review.resolve([trip])).resolves.toBeUndefined()
      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('no pull before the month has loaded', async () => {
      mockApi.getReview.mockReturnValue(new Promise(() => {}))
      render(<MonthPage month={november} onNavigate={vi.fn()} />)
      pull(200)
      expect(mockApi.getReview).toHaveBeenCalledTimes(1)
    })
  })
})
