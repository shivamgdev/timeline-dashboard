import { apiClient, DEFAULT_RETRIES } from '../../../api/client'
import { normalizeMachineIntervals } from '../utils/machineIntervals'
import type {
  CycleTimeBucket,
  CycleTimeRequest,
  MachineIntervals,
  MachineIntervalsRequest,
  MachineIntervalsResponse,
} from './analytics.types'

export const analyticsApi = {
  getMachineIntervals: async (request: MachineIntervalsRequest, signal?: AbortSignal): Promise<MachineIntervals> =>
    normalizeMachineIntervals(
      await apiClient.post<MachineIntervalsResponse>('/analytics-query/machine-intervals', request, {
        signal,
        retries: DEFAULT_RETRIES,
      }),
    ),
  getCycleTimes: (request: CycleTimeRequest, signal?: AbortSignal) =>
    apiClient.post<CycleTimeBucket[]>('/analytics-query', request, { signal, retries: DEFAULT_RETRIES }),
}
