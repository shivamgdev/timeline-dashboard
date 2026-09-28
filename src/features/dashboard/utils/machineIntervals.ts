import type { MachineIntervals, MachineIntervalsResponse } from '../api/analytics.types'

function arrayOrEmpty<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function normalizeMachineIntervals(response: MachineIntervalsResponse): MachineIntervals {
  return {
    machine_ids: arrayOrEmpty(response.machine_ids),
    runtimes: arrayOrEmpty(response.runtimes),
    downtimes: arrayOrEmpty(response.downtimes),
    stoppages: arrayOrEmpty(response.stoppages),
    produce_counts: arrayOrEmpty(response.produce_counts),
    produces: Array.isArray(response.produces) ? response.produces : null,
    metrics: response.metrics ?? null,
  }
}
