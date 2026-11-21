import { useEffect, useLayoutEffect, useRef } from 'react'

export function useRefreshOnReturn(onReturn: () => void): void {
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
