import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { useKeyboardInset } from './useKeyboardInset'

function fakeVisualViewport(height: number, offsetTop = 0) {
  const target = new EventTarget()
  return Object.assign(target, { height, offsetTop })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useKeyboardInset', () => {
  it('is 0 without visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
  })

  it('is the height the keyboard covers, and follows resizes', () => {
    vi.stubGlobal('innerHeight', 800)
    const vv = fakeVisualViewport(800)
    vi.stubGlobal('visualViewport', vv)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)

    act(() => {
      vv.height = 500
      vv.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(300)

    act(() => {
      vv.offsetTop = 100
      vv.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toBe(200)
  })
})
