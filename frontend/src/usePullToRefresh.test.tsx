import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { usePullToRefresh } from './usePullToRefresh'

interface HarnessProps {
  onRefresh: () => void
  enabled?: boolean
  refreshing?: boolean
}

function Harness({ onRefresh, enabled = true, refreshing = false }: HarnessProps) {
  const ref = useRef<HTMLElement>(null)
  const { distance, state } = usePullToRefresh(ref, { onRefresh, enabled, refreshing })
  return (
    <main ref={ref} data-testid="area">
      <span data-testid="state">{state}</span>
      <span data-testid="distance">{distance}</span>
    </main>
  )
}

function setup(props: Partial<HarnessProps> = {}) {
  const onRefresh = vi.fn()
  const view = render(<Harness onRefresh={onRefresh} {...props} />)
  return { onRefresh, area: screen.getByTestId('area'), ...view }
}

const at = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] })
const state = () => screen.getByTestId('state').textContent
const distance = () => screen.getByTestId('distance').textContent

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true })
}

afterEach(() => setScrollY(0))

describe('usePullToRefresh', () => {
  it('follows the finger at half speed', () => {
    const { area } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 200))
    expect(state()).toBe('pulling')
    expect(distance()).toBe('50')
  })

  it('says armed past the threshold', () => {
    const { area } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 260))
    expect(state()).toBe('armed')
    expect(distance()).toBe('80')
  })

  it('release past the threshold refreshes', () => {
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 260))
    fireEvent.touchEnd(area)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(distance()).toBe('0')
  })

  it('release under the threshold snaps back without refreshing', () => {
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 200))
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(state()).toBe('idle')
    expect(distance()).toBe('0')
  })

  it("doesn't start when scrolled down", () => {
    setScrollY(300)
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    expect(fireEvent.touchMove(area, at(100, 300))).toBe(true)
    expect(state()).toBe('idle')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('a touch that starts scrolled down never pulls, even after reaching the top', () => {
    setScrollY(300)
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    setScrollY(0)
    expect(fireEvent.touchMove(area, at(100, 150))).toBe(true)
    expect(fireEvent.touchMove(area, at(100, 300))).toBe(true)
    expect(state()).toBe('idle')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('cancels if the page scrolls mid-pull', () => {
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 260))
    expect(state()).toBe('armed')
    setScrollY(5)
    fireEvent.touchMove(area, at(100, 280))
    expect(state()).toBe('idle')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores a horizontal swipe', () => {
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(200, 100))
    expect(fireEvent.touchMove(area, at(100, 110))).toBe(true)
    expect(fireEvent.touchMove(area, at(60, 200))).toBe(true)
    expect(state()).toBe('idle')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores an upward drag', () => {
    const { area } = setup()
    fireEvent.touchStart(area, at(100, 300))
    expect(fireEvent.touchMove(area, at(100, 200))).toBe(true)
    expect(state()).toBe('idle')
  })

  it("doesn't prevent default before the 8px lock", () => {
    const { area } = setup()
    fireEvent.touchStart(area, at(100, 100))
    expect(fireEvent.touchMove(area, at(100, 105))).toBe(true)
    expect(state()).toBe('idle')
    expect(fireEvent.touchMove(area, at(100, 200))).toBe(false)
    expect(state()).toBe('pulling')
  })

  it('touchcancel ends without refreshing', () => {
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 260))
    fireEvent.touchCancel(area)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(state()).toBe('idle')
  })

  it('a second finger ends the pull', () => {
    const { area, onRefresh } = setup()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 260))
    fireEvent.touchMove(area, {
      touches: [
        { clientX: 100, clientY: 280 },
        { clientX: 150, clientY: 280 },
      ],
    })
    expect(state()).toBe('idle')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it("doesn't start while refreshing", () => {
    const { area, onRefresh } = setup({ refreshing: true })
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 300))
    expect(state()).toBe('refreshing')
    expect(distance()).toBe('0')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it("doesn't start while disabled", () => {
    const { area, onRefresh } = setup({ enabled: false })
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 300))
    expect(state()).toBe('idle')
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('mouse events do nothing', () => {
    const { area, onRefresh } = setup()
    fireEvent.mouseDown(area, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(area, { clientX: 100, clientY: 300 })
    fireEvent.mouseUp(area, { clientX: 100, clientY: 300 })
    expect(state()).toBe('idle')
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('removes its listeners on unmount', () => {
    const { area, onRefresh, unmount } = setup()
    unmount()
    fireEvent.touchStart(area, at(100, 100))
    fireEvent.touchMove(area, at(100, 300))
    fireEvent.touchEnd(area)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
