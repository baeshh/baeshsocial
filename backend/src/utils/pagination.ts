import { z } from 'zod'
import { HttpError } from './httpError.js'

/**
 * Keyset pagination over (sortValue DESC NULLS LAST, id DESC).
 * The cursor is the sort key of the last item on the previous page, so inserts and deletes between
 * requests never shift or duplicate rows the way OFFSET does.
 */
export type SortKey = { v: Date | null; id: string }

export type Page<T> = { items: T[]; nextCursor: string | null }

export function pageQuerySchema(defaultLimit: number, maxLimit: number) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    cursor: z.string().min(1).max(300).optional(),
  })
}

export function encodeCursor(key: SortKey) {
  return Buffer.from(JSON.stringify({ v: key.v ? key.v.toISOString() : null, id: key.id })).toString('base64url')
}

export function decodeCursor(raw: string | undefined): SortKey | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { v?: unknown; id?: unknown }
    if (typeof parsed.id !== 'string' || !parsed.id) throw new Error('id')
    if (parsed.v === null) return { v: null, id: parsed.id }
    if (typeof parsed.v !== 'string') throw new Error('v')
    const date = new Date(parsed.v)
    if (Number.isNaN(date.getTime())) throw new Error('date')
    return { v: date, id: parsed.id }
  } catch {
    throw new HttpError(400, '잘못된 페이지 커서입니다.')
  }
}

/** Prisma `where` fragment selecting rows that come strictly after `cursor`. */
export function keysetAfter(field: string, cursor: SortKey | null, nullable = false): Record<string, unknown> {
  if (!cursor) return {}
  if (cursor.v === null) {
    return { [field]: null, id: { lt: cursor.id } }
  }
  return {
    OR: [
      { [field]: { lt: cursor.v } },
      { [field]: cursor.v, id: { lt: cursor.id } },
      ...(nullable ? [{ [field]: null }] : []),
    ],
  }
}

export function keysetOrder(field: string, nullable = false) {
  return [
    nullable ? { [field]: { sort: 'desc' as const, nulls: 'last' as const } } : { [field]: 'desc' as const },
    { id: 'desc' as const },
  ]
}

export function compareSortKeys(a: SortKey, b: SortKey) {
  if (a.v && b.v) {
    const diff = b.v.getTime() - a.v.getTime()
    if (diff !== 0) return diff
  } else if (a.v && !b.v) {
    return -1
  } else if (!a.v && b.v) {
    return 1
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function isAfterCursor(key: SortKey, cursor: SortKey | null) {
  return !cursor || compareSortKeys(key, cursor) > 0
}

/** Expects `rows` fetched with `take: limit + 1`. */
export function toPage<T>(rows: T[], limit: number, keyOf: (row: T) => SortKey): Page<T> {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(keyOf(last)) : null }
}
