import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRefreshOnReturn } from './useRefreshOnReturn'

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useRefreshOnReturn', () => {
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('calls back when the page becomes visible', () => {
    const onReturn = vi.fn()
    renderHook(() => useRefreshOnReturn(onReturn))
    setVisibility('hidden')
    setVisibility('visible')
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it("doesn't call back when the page is hidden", () => {
    const onReturn = vi.fn()
    renderHook(() => useRefreshOnReturn(onReturn))
    setVisibility('hidden')
    expect(onReturn).not.toHaveBeenCalled()
  })

  it("doesn't call back on mount", () => {
    const onReturn = vi.fn()
    renderHook(() => useRefreshOnReturn(onReturn))
    expect(onReturn).not.toHaveBeenCalled()
  })

  it('uses the latest callback', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useRefreshOnReturn(cb), {
      initialProps: { cb: first },
    })
    rerender({ cb: second })
    setVisibility('visible')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops listening on unmount', () => {
    const onReturn = vi.fn()
    const { unmount } = renderHook(() => useRefreshOnReturn(onReturn))
    unmount()
    setVisibility('visible')
    expect(onReturn).not.toHaveBeenCalled()
  })
})
