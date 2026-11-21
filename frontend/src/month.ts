export interface YearMonth {
  year: number
  month: number
}

const MIN_YEAR = 2000
const MAX_YEAR = 2100

export const MONTH_INPUT_MIN = `${MIN_YEAR}-01`
export const MONTH_INPUT_MAX = `${MAX_YEAR}-12`

export function parseMonthPath(pathname: string): YearMonth | null {
  const match = /^\/(\d{4})\/(\d{1,2})\/?$/.exec(pathname)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null
  return { year, month }
}

export function toMonthInput({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parseMonthInput(value: string): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null
  return { year, month }
}

export function monthPath({ year, month }: YearMonth): string {
  return `/${year}/${month}`
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function formatMonth({ year, month }: YearMonth): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatShortMonth({ year, month }: YearMonth): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

export function currentMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}
