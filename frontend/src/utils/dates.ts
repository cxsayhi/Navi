const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
})

const longDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const compactDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})

export function fromIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00`)
}

export function toIsoDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const date = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

export function addDays(value: string, days: number): string {
  const date = fromIsoDate(value)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function formatShortDate(value: string): string {
  return shortDateFormatter.format(fromIsoDate(value))
}

export function formatLongDate(value: string): string {
  return longDateFormatter.format(fromIsoDate(value))
}

export function formatCompactDate(value: string): string {
  return compactDateFormatter.format(fromIsoDate(value))
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = fromIsoDate(startDate)
  const end = fromIsoDate(endDate)
  const year = start.getFullYear()
  return `${year} · ${shortDateFormatter.format(start)} — ${shortDateFormatter.format(end)}`
}
