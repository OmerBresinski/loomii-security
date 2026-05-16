const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { body, headers, ...rest } = options

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { code: "UNKNOWN", message: response.statusText },
    }))
    throw new Error(error.error?.message ?? "Request failed")
  }

  return response.json() as Promise<T>
}
