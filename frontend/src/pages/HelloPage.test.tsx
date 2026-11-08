import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSignOut, mockGetHello } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockGetHello: vi.fn(),
}))

vi.mock('firebase/auth', () => ({ signOut: mockSignOut }))
vi.mock('../firebase', () => ({ auth: { name: 'auth' } }))
vi.mock('../api', () => ({ api: { getHello: mockGetHello } }))

import HelloPage from './HelloPage'

describe('HelloPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the greeting and visit count from the API', async () => {
    mockGetHello.mockResolvedValue({ message: 'Hello, owlet', visits: 3 })
    render(<HelloPage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Hello, owlet' })).toBeInTheDocument()
    expect(screen.getByText('Visits: 3')).toBeInTheDocument()
  })

  it('shows an error when the API rejects the request', async () => {
    mockGetHello.mockRejectedValue(new Error('API error: 401'))
    render(<HelloPage />)
    expect(await screen.findByText('Could not load: API error: 401')).toBeInTheDocument()
  })

  it('signs out through Firebase', async () => {
    mockGetHello.mockResolvedValue({ message: 'Hello, owlet', visits: 1 })
    render(<HelloPage />)
    await screen.findByText('Visits: 1')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalledWith({ name: 'auth' })
  })
})
