const ACCESS_TOKEN_KEY = 'timeline-dashboard.access-token'

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const tokenStorage = {
  get(): string | null {
    return getSessionStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null
  },
  set(token: string): void {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  },
  clear(): void {
    getSessionStorage()?.removeItem(ACCESS_TOKEN_KEY)
  },
}
