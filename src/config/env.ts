export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_URL?.trim()
  if (!baseUrl) {
    throw new Error('VITE_API_URL is not configured. Copy .env.example to .env.local and set the backend base URL.')
  }
  return baseUrl.replace(/\/+$/, '')
}
