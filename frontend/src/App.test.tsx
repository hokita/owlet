import { render, screen, fireEvent, act } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { YearMonth } from './month'
import { currentMonth, monthPath } from './month'

const { mockOnAuthStateChanged } = vi.hoisted(() => ({
  mockOnAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
}))
vi.mock('./firebase', () => ({ auth: {} }))
vi.mock('./pages/LoginPage', () => ({ default: () => <div>login page</div> }))
vi.mock('./pages/MonthPage', () => ({
  default: ({
    month,
    onNavigate,
  }: {
    month: YearMonth
    onNavigate: (month: YearMonth) => void
  }) => (
    <div>
      month page {month.year}-{month.month}
      <button onClick={() => onNavigate({ year: 2027, month: 1 })}>go</button>
    </div>
  ),
}))

function signedIn() {
  mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
    callback({ uid: 'u1' })
    return () => {}
  })
}

import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders nothing while auth state is unknown', () => {
    mockOnAuthStateChanged.mockImplementation(() => () => {})
    const { container } = render(<App />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders LoginPage when signed out', () => {
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null)
      return () => {}
    })
    render(<App />)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('redirects / to the current month', () => {
    signedIn()
    render(<App />)
    const now = currentMonth()
    expect(window.location.pathname).toBe(monthPath(now))
    expect(screen.getByText(`month page ${now.year}-${now.month}`)).toBeInTheDocument()
  })

  it('redirects an unknown path to the current month', () => {
    window.history.replaceState(null, '', '/2026/13')
    signedIn()
    render(<App />)
    expect(window.location.pathname).toBe(monthPath(currentMonth()))
  })

  it('shows the month in the URL', () => {
    window.history.replaceState(null, '', '/2026/3')
    signedIn()
    render(<App />)
    expect(screen.getByText('month page 2026-3')).toBeInTheDocument()
  })

  it('pushes a history entry when navigating, and follows back/forward', () => {
    window.history.replaceState(null, '', '/2026/3')
    signedIn()
    render(<App />)
    const before = window.history.length
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(window.location.pathname).toBe('/2027/1')
    expect(window.history.length).toBe(before + 1)
    expect(screen.getByText('month page 2027-1')).toBeInTheDocument()

    act(() => {
      window.history.replaceState(null, '', '/2026/3')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByText('month page 2026-3')).toBeInTheDocument()
  })
})
