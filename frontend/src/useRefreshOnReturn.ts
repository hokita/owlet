import { useEffect, useLayoutEffect, useRef } from 'react'

// Calls `onReturn` whenever the page becomes visible again (tab switch, app
// foregrounded). The caller decides whether a refresh is due.
export function useRefreshOnReturn(onReturn: () => void): void {
  // The listener subscribes once, so it reads the latest callback from here.
  const latest = useRef(onReturn)
  useLayoutEffect(() => {
    latest.current = onReturn
  })

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') latest.current()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])
}
