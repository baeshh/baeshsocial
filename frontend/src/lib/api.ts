const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

type ApiOptions = RequestInit & {
  token?: string | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly details: unknown

  constructor(status: number, message: string, code: string | null = null, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type ErrorBody = { message?: string; code?: string; details?: unknown } | null

let onSessionEnded: ((message: string) => void) | null = null

/** Called once when the server says the session is gone (revoked, expired, suspended account). */
export function setSessionEndedHandler(handler: (message: string) => void) {
  onSessionEnded = handler
}

function toApiError(status: number, data: ErrorBody, fallback: string, sentToken: boolean) {
  const code = data?.code ?? null
  if (sentToken && code && (code.startsWith('session_') || code === 'invalid_token')) {
    onSessionEnded?.(data?.message ?? '로그인이 만료되었습니다. 다시 로그인해 주세요.')
  }
  const details = data?.details ?? null
  const detailCode = details && typeof details === 'object' && 'code' in details ? String((details as { code: unknown }).code) : null
  return new ApiError(status, data?.message ?? fallback, code ?? detailCode, details)
}

/** 402 from plan limits / ended contracts / features outside the plan. */
export function isBillingError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 402
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, headers, ...requestOptions } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type')
  const data = contentType?.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw toApiError(response.status, data, 'API request failed', Boolean(token))
  }

  return data as T
}

export function withQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

/** Multipart variant: lets the browser set the multipart boundary header. */
export async function apiUpload<T>(path: string, body: FormData, options: { token?: string | null; method?: string } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'POST',
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
    body,
  })
  const contentType = response.headers.get('content-type')
  const data = contentType?.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    throw toApiError(response.status, data, '업로드에 실패했습니다.', Boolean(options.token))
  }
  return data as T
}

/** Fetches an authenticated binary response and saves it with the server-provided file name. */
export async function apiDownload(path: string, token: string, fallbackName: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
    throw toApiError(response.status, data, '파일을 내려받지 못했습니다.', true)
  }
  const disposition = response.headers.get('content-disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const fileName = encoded ? decodeURIComponent(encoded) : fallbackName
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Signed URLs from the local storage driver are relative to the API base. */
export function resolveApiUrl(url: string) {
  return /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`
}
