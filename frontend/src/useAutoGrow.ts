import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

// Sizes a textarea to its content, up to maxLines, then lets it scroll.
// Not CSS field-sizing: iOS Safari support is too recent to rely on.
export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines = 5
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
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
  }, [ref, value, maxLines])
}
