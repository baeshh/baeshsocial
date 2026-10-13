const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

type ApiOptions = RequestInit & {
  token?: string | null
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
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
    throw new ApiError(response.status, data?.message ?? 'API request failed')
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
    throw new ApiError(response.status, data?.message ?? '업로드에 실패했습니다.')
  }
  return data as T
}

/** Signed URLs from the local storage driver are relative to the API base. */
export function resolveApiUrl(url: string) {
  return /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`
}
