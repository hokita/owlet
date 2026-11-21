import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

function fit(el: HTMLTextAreaElement, maxLines: number) {
  const style = getComputedStyle(el)
  const px = (v: string) => parseFloat(v) || 0
  const borders = px(style.borderTopWidth) + px(style.borderBottomWidth)
  const padding = px(style.paddingTop) + px(style.paddingBottom)
  const max = px(style.lineHeight) * maxLines + padding + borders
  el.style.height = 'auto'
  const wanted = el.scrollHeight + borders
  el.style.height = `${Math.min(wanted, max)}px`
  el.style.overflowY = wanted > max ? 'auto' : 'hidden'
}

export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  _value: string,
  maxLines = 5
) {
  const watched = useRef<{ el: HTMLTextAreaElement; observer: ResizeObserver } | null>(null)
  const lines = useRef(maxLines)

  useLayoutEffect(() => {
    lines.current = maxLines
    const el = ref.current
    if (el) fit(el, maxLines)
    if (watched.current?.el === el) return
    watched.current?.observer.disconnect()
    watched.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
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
