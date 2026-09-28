import { getApiBaseUrl } from '../config/env'
import { ApiError, isApiError, NETWORK_ERROR_STATUS } from './errors'
import type { ApiEnvelope, RequestConfig, RequestOptions } from './types'

interface ApiClientHooks {
  getAccessToken: () => string | null
  onUnauthorized: () => void
}

export const DEFAULT_RETRIES = 2
const RETRY_BASE_DELAY_MS = 500

const hooks: ApiClientHooks = {
  getAccessToken: () => null,
  onUnauthorized: () => {},
}

export function configureApiClient(overrides: Partial<ApiClientHooks>): void {
  Object.assign(hooks, overrides)
}

async function request<T>(path: string, { retries = 0, ...options }: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send<T>(path, options)
    } catch (error) {
      if (attempt >= retries || !isApiError(error) || !error.isRetryable) throw error
      await wait(RETRY_BASE_DELAY_MS * 2 ** attempt, options.signal)
    }
  }
}

async function send<T>(
  path: string,
  { method = 'GET', body, signal, authenticated = true, accessToken }: Omit<RequestOptions, 'retries'>,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`
  const headers = new Headers({ Accept: 'application/json' })
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const token = authenticated ? (accessToken ?? hooks.getAccessToken()) : null
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('Unable to reach the server. Check your connection and try again.', NETWORK_ERROR_STATUS, {
      cause: error,
    })
  }

  const payload = await parseJson(response)
  const envelope = isEnvelope(payload) ? payload : null
  const status = response.ok && envelope ? envelope.status_code : response.status

  if (status >= 400) {
    // A 401 for a token that has since been replaced must not end the newer session.
    if (status === 401 && authenticated && hooks.getAccessToken() === token) hooks.onUnauthorized()
    throw new ApiError(envelope?.message || response.statusText || `Request failed with status ${status}`, status, {
      traceId: envelope?.trace_id ?? null,
      details: envelope ? envelope.data : payload,
    })
  }

  if (!envelope) {
    throw new ApiError('Received an unexpected response from the server.', response.status, { details: payload })
  }

  return envelope.data as T
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status_code' in value &&
    typeof value.status_code === 'number' &&
    'data' in value
  )
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export const apiClient = {
  get: <T>(path: string, config?: RequestConfig) => request<T>(path, { ...config, method: 'GET' }),
  post: <T>(path: string, body?: unknown, config?: RequestConfig) =>
    request<T>(path, { ...config, method: 'POST', body }),
}
