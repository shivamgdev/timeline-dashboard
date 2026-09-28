import type { HourlySummary } from './types'

export const SANITY_TOLERANCE_MS = 60_000

export interface HourSanity {
  columnIndex: number
  expectedMs: number
  specifiedKindsMs: number
  plannedDowntimeMs: number
  unclassifiedMs: number
  uncoveredMs: number
}

export interface HourlySanityResult {
  checked: HourSanity[]
  withinTolerance: number[]
  explainedByOtherKinds: number[]
  uncovered: number[]
  overlapping: number[]
}

export function checkHourlySanity(summary: HourlySummary, toleranceMs = SANITY_TOLERANCE_MS): HourlySanityResult {
  const result: HourlySanityResult = {
    checked: [],
    withinTolerance: [],
    explainedByOtherKinds: [],
    uncovered: [],
    overlapping: [],
  }

  summary.columns.forEach((column, columnIndex) => {
    if (column.state !== 'complete' || !column.durationsMs || column.elapsedMs === null) return
    const durations = column.durationsMs
    const specifiedKindsMs =
      durations.runtime + durations['unplanned-production'] + durations.stoppage + durations['unknown-downtime']
    const plannedDowntimeMs = durations['planned-downtime']
    const unclassifiedMs = durations.unclassified
    const uncoveredMs = column.elapsedMs - specifiedKindsMs - plannedDowntimeMs - unclassifiedMs
    const hour: HourSanity = {
      columnIndex,
      expectedMs: column.elapsedMs,
      specifiedKindsMs,
      plannedDowntimeMs,
      unclassifiedMs,
      uncoveredMs,
    }
    result.checked.push(hour)

    if (Math.abs(column.elapsedMs - specifiedKindsMs) <= toleranceMs) result.withinTolerance.push(columnIndex)
    else if (uncoveredMs > toleranceMs) result.uncovered.push(columnIndex)
    else if (uncoveredMs < -toleranceMs) result.overlapping.push(columnIndex)
    else result.explainedByOtherKinds.push(columnIndex)
  })

  return result
}
