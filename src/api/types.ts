export interface ApiEnvelope<T> {
  trace_id: string
  status_code: number
  message: string
  data: T
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  signal?: AbortSignal
  authenticated?: boolean
  accessToken?: string
  retries?: number
}

export type RequestConfig = Omit<RequestOptions, 'method' | 'body'>
