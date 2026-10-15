/** Calendar-date rules (deadlines) are judged in Korea time, whatever the server or viewer clock zone is. */
export const SERVICE_TIME_ZONE = 'Asia/Seoul'

const serviceDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: SERVICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in Korea as `YYYY-MM-DD`. */
export const serviceToday = (now = new Date()) => serviceDay.format(now)

/**
 * An opportunity deadline is a calendar date (stored as midnight UTC of that date), open through the whole
 * day in Korea. The Jobs list "open" filter and the web client use the same rule.
 */
export const isDeadlinePassed = (deadline: Date | null, now = new Date()) =>
  deadline !== null && deadline.toISOString().slice(0, 10) < serviceToday(now)
