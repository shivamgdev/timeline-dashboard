export const NETWORK_ERROR_STATUS = 0

interface ApiErrorOptions {
  traceId?: string | null
  details?: unknown
  cause?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly traceId: string | null
  readonly details: unknown

  constructor(message: string, status: number, { traceId = null, details = null, cause }: ApiErrorOptions = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.traceId = traceId
    this.details = details
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isValidationError(): boolean {
    return this.status === 422
  }

  get isRetryable(): boolean {
    return this.status === NETWORK_ERROR_STATUS || this.status >= 500
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

const MAX_VALIDATION_MESSAGES = 3

export function getValidationMessages(details: unknown): string[] {
  if (typeof details !== 'object' || details === null || !('errors' in details) || !Array.isArray(details.errors)) {
    return []
  }
  return details.errors.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('msg' in entry) || typeof entry.msg !== 'string') return []
    const location =
      'loc' in entry && Array.isArray(entry.loc) ? entry.loc.filter((part) => part !== 'body').join('.') : ''
    return [location ? `${location}: ${entry.msg}` : entry.msg]
  })
}

export function getErrorMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (!isApiError(error)) return fallback
  if (error.isForbidden) return 'Access denied.'
  if (error.status >= 500) return fallback
  if (error.isValidationError) {
    const messages = getValidationMessages(error.details).slice(0, MAX_VALIDATION_MESSAGES)
    if (messages.length > 0) return `${error.message || 'Validation error'}: ${messages.join('; ')}`
  }
  return error.message || fallback
}
