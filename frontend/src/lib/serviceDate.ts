const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Today's date in Korea as `YYYY-MM-DD`; calendar-date rules use it wherever the viewer is. */
export const seoulToday = (now = new Date()) => seoulDay.format(now)

/**
 * Whole days from today (Korea) to a date-only value stored as midnight UTC (`YYYY-MM-DD…`).
 * Negative once the date has passed.
 */
export function daysUntil(isoDate: string, now = new Date()) {
  const [year, month, date] = isoDate.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, date) - Date.parse(`${seoulToday(now)}T00:00:00Z`)) / 86_400_000)
}

/** `10월 15일` for a date-only value. */
export function shortDateLabel(isoDate: string) {
  const [, month, date] = isoDate.slice(0, 10).split('-').map(Number)
  return `${month}월 ${date}일`
}
