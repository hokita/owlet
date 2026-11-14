export const NOTE_TYPES = ['event', 'learn', 'next'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export interface YearMonth {
  year: number
  month: number
}

export type Command =
  { command: 'help' } | { command: 'add'; type: NoteType; text: string; month: YearMonth }

export class UsageError extends Error {}

// The owner's months follow the Tokyo calendar, wherever the agent runs.
export function tokyoMonth(now: Date): YearMonth {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month') }
}

function parseMonth(value: string | undefined): YearMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  const month = Number(match?.[2])
  if (!match || month < 1 || month > 12) throw new UsageError('Month must look like YYYY-MM')
  return { year: Number(match[1]), month }
}

export function parseArgs(argv: string[], now: Date): Command {
  const [command, ...rest] = argv
  if (!command || ['help', '--help', '-h'].includes(command)) return { command: 'help' }
  if (command !== 'add') throw new UsageError(`Unknown command: ${command}`)

  const positional: string[] = []
  let month: YearMonth | undefined
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--month') {
      month = parseMonth(rest[++i])
    } else if (arg.startsWith('--month=')) {
      month = parseMonth(arg.slice('--month='.length))
    } else if (arg.startsWith('--')) {
      throw new UsageError(`Unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  const [type, text, extra] = positional
  if (!type) throw new UsageError('Expected a type')
  if (!(NOTE_TYPES as readonly string[]).includes(type)) {
    throw new UsageError(`Type must be one of: ${NOTE_TYPES.join(', ')}`)
  }
  if (!text?.trim()) throw new UsageError('Expected the note text')
  if (extra !== undefined) throw new UsageError(`Unexpected argument: ${extra}`)

  return { command: 'add', type: type as NoteType, text, month: month ?? tokyoMonth(now) }
}
