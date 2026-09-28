import { tryParseUtcTimestamp } from '../../../utils/timezone'
import type { CycleTimeBucket } from '../api/analytics.types'
import { HOURLY_BUCKET_MS } from '../timeline/chartModel'
import type { TimelineData } from '../timeline/types'
import type { CycleTimeEntry, HourlySummary, HourlySummaryColumn, SegmentDurations } from './types'

function emptyDurations(): SegmentDurations {
  return {
    runtime: 0,
    'unplanned-production': 0,
    'planned-downtime': 0,
    'unknown-downtime': 0,
    stoppage: 0,
    unclassified: 0,
  }
}

function toSecondsOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeCycleTimes(buckets: readonly CycleTimeBucket[]): {
  entries: CycleTimeEntry[]
  invalid: number
} {
  const entries: CycleTimeEntry[] = []
  let invalid = 0
  for (const bucket of buckets) {
    const bucketStartMs = tryParseUtcTimestamp(bucket.bucket_start)
    if (bucketStartMs === null) {
      invalid++
      continue
    }
    entries.push({
      bucketStartMs,
      idealSeconds: toSecondsOrNull(bucket.ideal_cycle_time_seconds),
      actualSeconds: toSecondsOrNull(bucket.actual_cycle_time_seconds),
    })
  }
  return { entries: entries.sort((a, b) => a.bucketStartMs - b.bucketStartMs), invalid }
}

function validateBoundaries(boundaries: readonly number[]): void {
  if (boundaries.length < 2) throw new RangeError('At least two column boundaries are required')
  for (let index = 1; index < boundaries.length; index++) {
    if (!(boundaries[index]! > boundaries[index - 1]!)) throw new RangeError('Column boundaries must be increasing')
  }
}

function columnIndexOf(boundaries: readonly number[], timeMs: number): number {
  for (let index = 0; index < boundaries.length - 1; index++) {
    if (timeMs >= boundaries[index]! && timeMs < boundaries[index + 1]!) return index
  }
  return -1
}

function bucketColumnIndex(boundaries: readonly number[], bucketStartMs: number): number {
  const windowStartMs = boundaries[0]!
  const overlapsWindowStart = bucketStartMs < windowStartMs && bucketStartMs + HOURLY_BUCKET_MS > windowStartMs
  return columnIndexOf(boundaries, overlapsWindowStart ? windowStartMs : bucketStartMs)
}

export interface HourlySummaryInput {
  timeline: TimelineData
  cycleTimes: readonly CycleTimeBucket[]
  boundaries: readonly number[]
  nowMs: number
}

export function buildHourlySummary({ timeline, cycleTimes, boundaries, nowMs }: HourlySummaryInput): HourlySummary {
  validateBoundaries(boundaries)

  const columns: HourlySummaryColumn[] = []
  for (let index = 0; index < boundaries.length - 1; index++) {
    const startMs = boundaries[index]!
    const endMs = boundaries[index + 1]!
    if (startMs >= nowMs) {
      columns.push({
        startMs,
        endMs,
        state: 'future',
        elapsedMs: null,
        durationsMs: null,
        production: null,
        cycleTime: null,
      })
      continue
    }
    const filledUntilMs = Math.min(endMs, nowMs)
    const durationsMs = emptyDurations()
    for (const segment of timeline.segments) {
      const overlap = Math.min(segment.endMs, filledUntilMs) - Math.max(segment.startMs, startMs)
      if (overlap > 0) durationsMs[segment.kind] += overlap
    }
    columns.push({
      startMs,
      endMs,
      state: endMs <= nowMs ? 'complete' : 'in-progress',
      elapsedMs: filledUntilMs - startMs,
      durationsMs,
      production: { okCount: 0, ngCount: 0, total: 0 },
      cycleTime: { idealSeconds: null, actualSeconds: null },
    })
  }

  const unassignedProduction: HourlySummary['unassignedProduction'] = []
  for (const bucket of timeline.hourlyProduction) {
    if (bucket.bucketStartMs >= nowMs) continue
    const index = bucketColumnIndex(boundaries, bucket.bucketStartMs)
    if (index === -1) {
      unassignedProduction.push(bucket)
      continue
    }
    const production = columns[index]!.production
    if (!production) continue
    production.okCount += bucket.okCount
    production.ngCount += bucket.ngCount
    production.total += bucket.okCount + bucket.ngCount
  }

  const { entries, invalid } = normalizeCycleTimes(cycleTimes)
  const unassignedCycleTimes: CycleTimeEntry[] = []
  const matchesPerColumn = new Map<number, number>()
  for (const entry of entries) {
    if (entry.bucketStartMs >= nowMs) continue
    const index = bucketColumnIndex(boundaries, entry.bucketStartMs)
    if (index === -1) {
      unassignedCycleTimes.push(entry)
      continue
    }
    const column = columns[index]!
    if (!column.cycleTime) continue
    const matches = (matchesPerColumn.get(index) ?? 0) + 1
    matchesPerColumn.set(index, matches)
    column.cycleTime =
      matches === 1
        ? { idealSeconds: entry.idealSeconds, actualSeconds: entry.actualSeconds }
        : { idealSeconds: null, actualSeconds: null }
  }
  const columnsWithMultipleCycleTimes = [...matchesPerColumn].filter(([, count]) => count > 1).map(([index]) => index)

  return {
    columns,
    unassignedProduction,
    unassignedCycleTimes,
    columnsWithMultipleCycleTimes,
    invalidCycleTimes: invalid,
  }
}
