import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useAutoGrow } from './useAutoGrow'

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
  const ref = { current: el }
  const hook = renderHook(({ v }) => useAutoGrow(ref, v), { initialProps: { v: value } })
  return { el, stub, rerender: (v: string) => hook.rerender({ v }) }
}

describe('useAutoGrow', () => {
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
})
