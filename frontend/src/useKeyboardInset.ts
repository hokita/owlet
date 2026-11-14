import { useEffect, useState } from 'react'

// How many pixels at the bottom of the layout viewport the on-screen keyboard
// covers. iOS Safari doesn't resize the layout viewport for the keyboard, so a
// `position: fixed; bottom: 0` bar would sit behind it without this offset.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
