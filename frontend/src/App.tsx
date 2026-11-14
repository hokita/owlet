import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './firebase'
import { currentMonth, monthPath, parseMonthPath } from './month'
import type { YearMonth } from './month'
import LoginPage from './pages/LoginPage'
import MonthPage from './pages/MonthPage'

// The only route is /:year/:month; anything else lands on the current month.
function monthFromLocation(): YearMonth {
  return parseMonthPath(window.location.pathname) ?? currentMonth()
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [month, setMonth] = useState<YearMonth>(monthFromLocation)

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  // Puts `/` (or an invalid path) in the URL bar as the month being shown.
  useEffect(() => {
    if (window.location.pathname !== monthPath(month)) {
      window.history.replaceState(null, '', monthPath(month))
    }
  }, [month])

  useEffect(() => {
    const onPopState = () => setMonth(monthFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(next: YearMonth) {
    window.history.pushState(null, '', monthPath(next))
    setMonth(next)
  }

  if (user === undefined) return null
  if (!user) return <LoginPage />
  return <MonthPage key={monthPath(month)} month={month} onNavigate={navigate} />
}
