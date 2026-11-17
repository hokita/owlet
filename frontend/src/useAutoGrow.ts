import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

function fit(el: HTMLTextAreaElement, maxLines: number) {
  const style = getComputedStyle(el)
  const px = (v: string) => parseFloat(v) || 0
  const borders = px(style.borderTopWidth) + px(style.borderBottomWidth)
  const padding = px(style.paddingTop) + px(style.paddingBottom)
  const max = px(style.lineHeight) * maxLines + padding + borders
  // Reset first so scrollHeight shrinks along with the text.
  el.style.height = 'auto'
  const wanted = el.scrollHeight + borders
  el.style.height = `${Math.min(wanted, max)}px`
  el.style.overflowY = wanted > max ? 'auto' : 'hidden'
}

// Sizes a textarea to its content, up to maxLines, then lets it scroll.
// Not CSS field-sizing: iOS Safari support is too recent to rely on.
export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  // Not read: it only makes callers re-render, and so re-measure, when the text changes.
  _value: string,
  maxLines = 5
) {
  const watched = useRef<{ el: HTMLTextAreaElement; observer: ResizeObserver } | null>(null)
  const lines = useRef(maxLines)

  // No dependency list: the same textarea element can be handed to a different
  // field (new note <-> edit), and a stale height would stay behind.
  useLayoutEffect(() => {
    lines.current = maxLines
    const el = ref.current
    if (el) fit(el, maxLines)
    if (watched.current?.el === el) return
    watched.current?.observer.disconnect()
    watched.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    // A narrower box (window resized, phone rotated) wraps the same text onto
    // more lines without a render. Only a width change re-fits: the height
    // change that fitting causes is reported too, and must not loop.
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit(el, lines.current)
    })
    observer.observe(el)
    watched.current = { el, observer }
  })

  useEffect(
    () => () => {
      watched.current?.observer.disconnect()
      watched.current = null
    },
    []
  )
}
