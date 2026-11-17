import { renderHook } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import { useAutoGrow } from './useAutoGrow'
import {
  installFakeResizeObserver,
  observedElements,
  triggerResize,
  uninstallFakeResizeObserver,
} from './testing/fakeResizeObserver'

// jsdom has no layout: the style is inline and scrollHeight is stubbed.
function setup(value: string, scrollHeight: number) {
  const el = document.createElement('textarea')
  Object.assign(el.style, {
    lineHeight: '24px',
    paddingTop: '8px',
    paddingBottom: '8px',
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderStyle: 'solid',
  })
  const stub = (n: number) =>
    Object.defineProperty(el, 'scrollHeight', { value: n, configurable: true })
  stub(scrollHeight)
  setWidth(el, 300)
  const ref = { current: el }
  const hook = renderHook(({ v }) => useAutoGrow(ref, v), { initialProps: { v: value } })
  return { el, stub, rerender: (v: string) => hook.rerender({ v }), unmount: hook.unmount }
}

function setWidth(el: HTMLElement, width: number) {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true })
}

describe('useAutoGrow', () => {
  afterEach(() => uninstallFakeResizeObserver())

  it('grows to fit the text', () => {
    const { el } = setup('a\nb\nc', 88)
    expect(el.style.height).toBe('90px')
    expect(el.style.overflowY).toBe('hidden')
  })

  it('stops at 5 lines and scrolls', () => {
    const { el } = setup('a\nb\nc', 400)
    expect(el.style.height).toBe('138px')
    expect(el.style.overflowY).toBe('auto')
  })

  it('shrinks when text is removed', () => {
    const { el, stub, rerender } = setup('a\nb\nc', 88)
    stub(40)
    rerender('a')
    expect(el.style.height).toBe('42px')
  })

  describe('when the box changes width', () => {
    it('re-measures the same text when it wraps differently', () => {
      installFakeResizeObserver()
      const { el, stub } = setup('a long line', 40)
      expect(el.style.height).toBe('42px')

      // Narrower (window resized, phone rotated): the text now wraps to 2 lines.
      setWidth(el, 150)
      stub(64)
      triggerResize()
      expect(el.style.height).toBe('66px')
    })

    it('ignores a resize that keeps the width, so its own height change cannot loop', () => {
      installFakeResizeObserver()
      const { el, stub } = setup('a long line', 40)
      stub(64)
      triggerResize()
      expect(el.style.height).toBe('42px')
    })

    it('stops observing when unmounted', () => {
      installFakeResizeObserver()
      const { el, unmount } = setup('a', 40)
      expect(observedElements()).toContain(el)
      unmount()
      expect(observedElements()).toEqual([])
    })
  })

  it('works without ResizeObserver', () => {
    const { el } = setup('a\nb\nc', 88)
    expect(el.style.height).toBe('90px')
  })
})
