import { apiClient, DEFAULT_RETRIES } from '../../../api/client'
import type { ShiftDefinition } from '../types'

export const shiftsApi = {
  getAll: (signal?: AbortSignal) =>
    apiClient.get<ShiftDefinition[]>('/core/shifts', { signal, retries: DEFAULT_RETRIES }),
}
