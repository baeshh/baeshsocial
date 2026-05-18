const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

type ApiOptions = RequestInit & {
  token?: string | null
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
    if (!response.ok) {
      throw new Error('API request failed')
    }
    return undefined as T
  }

  const contentType = response.headers.get('content-type')
  const data = contentType?.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(data?.message ?? 'API request failed')
  }

  return data as T
}
