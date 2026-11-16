import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { isArmed, pullDistance } from './pullToRefresh'

export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing'

interface Options {
  onRefresh: () => void
  enabled: boolean
  // Owned by the caller: while true, new touches are ignored.
  refreshing: boolean
}

export function usePullToRefresh(
  ref: RefObject<HTMLElement>,
  options: Options
): { distance: number; state: PullState } {
  const [distance, setDistance] = useState(0)
  // The listeners subscribe once, so they read the latest options from here.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const start = useRef<{ x: number; y: number } | null>(null)
  // Decided on the first real movement, as in NoteRow: only a vertical drag can
  // pull; a horizontal one is a swipe and is left alone.
  const direction = useRef<'horizontal' | 'vertical' | null>(null)
  // The distance now, for touchend to read without waiting for a render.
  const current = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function reset() {
      start.current = null
      direction.current = null
      current.current = 0
      setDistance(0)
    }

    function handleTouchStart(e: TouchEvent) {
      reset()
      if (!latest.current.enabled || latest.current.refreshing) return
      if (e.touches.length !== 1) return
      // A touch that begins scrolled down never pulls, even if the page reaches
      // the top during it: with no start point, the rest of the touch is ignored.
      if (window.scrollY > 0) return
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!start.current) return
      // A second finger (a pinch) or a page that has scrolled ends the pull.
      if (e.touches.length !== 1 || window.scrollY > 0) {
        reset()
        return
      }
      const t = e.touches[0]
      const dx = t.clientX - start.current.x
      const dy = t.clientY - start.current.y
      if (direction.current === null && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        direction.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
        // Horizontal drags and upward scrolls are not ours for the rest of the touch.
        if (direction.current === 'horizontal' || dy <= 0) {
          start.current = null
          return
        }
      }
      if (direction.current !== 'vertical') return
      // Stop the browser's own overscroll bounce only while we are pulling.
      e.preventDefault()
      current.current = pullDistance(dy)
      setDistance(current.current)
    }

    function handleTouchEnd() {
      const shouldRefresh = start.current !== null && isArmed(current.current)
      reset()
      if (shouldRefresh) latest.current.onRefresh()
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    // Not passive: React's touch handlers are, and a passive listener can't stop
    // the iOS bounce.
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    el.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', reset)
    }
  }, [ref])

  if (options.refreshing) return { distance: 0, state: 'refreshing' }
  return { distance, state: isArmed(distance) ? 'armed' : distance > 0 ? 'pulling' : 'idle' }
}
