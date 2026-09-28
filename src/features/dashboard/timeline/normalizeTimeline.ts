import { tryParseUtcTimestamp } from '../../../utils/timezone'
import type {
  DowntimeSegment,
  MachineIntervals,
  ProduceBucket,
  ProduceCount,
  RuntimeSegment,
  StoppageSegment,
} from '../api/analytics.types'
import type { ShiftWindow } from '../types'
import {
  PRODUCE_FAIL,
  PRODUCE_PASS,
  PRODUCE_UNCLASSIFIED,
  type HourlyProduction,
  type ProduceResultCode,
  type ProduceSeries,
  type SegmentKind,
  type SegmentSource,
  type TimelineData,
  type TimelineDiagnostics,
  type TimelineSegment,
} from './types'

const RUNTIME_KINDS: ReadonlyMap<unknown, SegmentKind> = new Map([
  ['planned', 'runtime'],
  ['unknown unplanned production', 'unplanned-production'],
])

const DOWNTIME_KINDS: ReadonlyMap<unknown, SegmentKind> = new Map([
  ['planned', 'planned-downtime'],
  ['unknown', 'unknown-downtime'],
])

interface SegmentInput {
  source: SegmentSource
  kind: SegmentKind
  type: string | null
  name: string | null
  start_at: unknown
  end_at: unknown
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function runtimeInput(segment: RuntimeSegment): SegmentInput {
  return {
    source: 'runtimes',
    kind: RUNTIME_KINDS.get(segment.type) ?? 'unclassified',
    type: toStringOrNull(segment.type),
    name: toStringOrNull(segment.runtime_name),
    start_at: segment.start_at,
    end_at: segment.end_at,
  }
}

function downtimeInput(segment: DowntimeSegment): SegmentInput {
  return {
    source: 'downtimes',
    kind: DOWNTIME_KINDS.get(segment.type) ?? 'unclassified',
    type: toStringOrNull(segment.type),
    name: toStringOrNull(segment.downtime_name),
    start_at: segment.start_at,
    end_at: segment.end_at,
  }
}

function stoppageInput(segment: StoppageSegment): SegmentInput {
  return {
    source: 'stoppages',
    kind: 'stoppage',
    type: toStringOrNull(segment.type),
    name: null,
    start_at: segment.start_at,
    end_at: segment.end_at,
  }
}

function emptyDiagnostics(): TimelineDiagnostics {
  return {
    invalidSegments: 0,
    zeroLengthSegments: 0,
    segmentsOutsideWindow: 0,
    clippedSegments: 0,
    invalidProduces: 0,
    producesOutsideWindow: 0,
    invalidProduceCounts: 0,
  }
}

function clipSegments(
  inputs: readonly SegmentInput[],
  windowStartMs: number,
  windowEndMs: number,
  diagnostics: TimelineDiagnostics,
): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  for (const input of inputs) {
    const sourceStartMs = tryParseUtcTimestamp(input.start_at)
    const sourceEndMs = tryParseUtcTimestamp(input.end_at)
    if (sourceStartMs === null || sourceEndMs === null || sourceEndMs < sourceStartMs) {
      diagnostics.invalidSegments++
      continue
    }
    if (sourceEndMs === sourceStartMs) {
      diagnostics.zeroLengthSegments++
      continue
    }
    const startMs = Math.max(sourceStartMs, windowStartMs)
    const endMs = Math.min(sourceEndMs, windowEndMs)
    if (endMs <= startMs) {
      diagnostics.segmentsOutsideWindow++
      continue
    }
    const clipped = startMs !== sourceStartMs || endMs !== sourceEndMs
    if (clipped) diagnostics.clippedSegments++
    segments.push({
      kind: input.kind,
      source: input.source,
      type: input.type,
      name: input.name,
      startMs,
      endMs,
      sourceStartMs,
      sourceEndMs,
      clipped,
    })
  }
  return segments.sort((a, b) => a.startMs - b.startMs)
}

function aggregateHourlyProduction(
  counts: readonly ProduceCount[],
  diagnostics: TimelineDiagnostics,
): HourlyProduction[] {
  const byBucket = new Map<number, HourlyProduction>()
  for (const count of counts) {
    const bucketStartMs = tryParseUtcTimestamp(count.bucket_start)
    if (bucketStartMs === null || !Number.isFinite(count.ok_count) || !Number.isFinite(count.ng_count)) {
      diagnostics.invalidProduceCounts++
      continue
    }
    const bucket = byBucket.get(bucketStartMs) ?? { bucketStartMs, okCount: 0, ngCount: 0 }
    bucket.okCount += count.ok_count
    bucket.ngCount += count.ng_count
    byBucket.set(bucketStartMs, bucket)
  }
  return [...byBucket.values()].sort((a, b) => a.bucketStartMs - b.bucketStartMs)
}

function toResultCode(result: unknown): ProduceResultCode {
  if (result === 'PASS') return PRODUCE_PASS
  if (result === 'FAIL') return PRODUCE_FAIL
  return PRODUCE_UNCLASSIFIED
}

function buildProduceSeries(
  buckets: readonly ProduceBucket[],
  windowStartMs: number,
  windowEndMs: number,
  diagnostics: TimelineDiagnostics,
): ProduceSeries {
  const total = buckets.reduce((sum, bucket) => sum + (Array.isArray(bucket.produces) ? bucket.produces.length : 0), 0)
  const rawTimes = new Float64Array(total)
  const rawCodes = new Uint8Array(total)
  const unclassifiedResults: Record<string, number> = {}
  let size = 0

  for (const bucket of buckets) {
    if (!Array.isArray(bucket.produces)) continue
    for (const produce of bucket.produces) {
      const timeMs = tryParseUtcTimestamp(produce.first_seen_ts)
      if (timeMs === null) {
        diagnostics.invalidProduces++
        continue
      }
      if (timeMs < windowStartMs || timeMs >= windowEndMs) {
        diagnostics.producesOutsideWindow++
        continue
      }
      const code = toResultCode(produce.result)
      if (code === PRODUCE_UNCLASSIFIED) {
        const label = typeof produce.result === 'string' ? produce.result : 'UNKNOWN'
        unclassifiedResults[label] = (unclassifiedResults[label] ?? 0) + 1
      }
      rawTimes[size] = timeMs
      rawCodes[size] = code
      size++
    }
  }

  const order = new Uint32Array(size)
  for (let index = 0; index < size; index++) order[index] = index
  order.sort((a, b) => rawTimes[a]! - rawTimes[b]!)

  const timesMs = new Float64Array(size)
  const resultCodes = new Uint8Array(size)
  let passCount = 0
  let failCount = 0
  for (let index = 0; index < size; index++) {
    const source = order[index]!
    timesMs[index] = rawTimes[source]!
    const code = rawCodes[source]!
    resultCodes[index] = code
    if (code === PRODUCE_PASS) passCount++
    else if (code === PRODUCE_FAIL) failCount++
  }

  return { timesMs, resultCodes, passCount, failCount, unclassifiedResults }
}

export function normalizeTimeline(
  intervals: MachineIntervals,
  shiftWindow: Pick<ShiftWindow, 'startMs' | 'endMs'>,
): TimelineData {
  const { startMs: windowStartMs, endMs: windowEndMs } = shiftWindow
  const diagnostics = emptyDiagnostics()

  const inputs: SegmentInput[] = [
    ...intervals.runtimes.map(runtimeInput),
    ...intervals.downtimes.map(downtimeInput),
    ...intervals.stoppages.map(stoppageInput),
  ]

  return {
    windowStartMs,
    windowEndMs,
    segments: clipSegments(inputs, windowStartMs, windowEndMs, diagnostics),
    hourlyProduction: aggregateHourlyProduction(intervals.produce_counts, diagnostics),
    produces: intervals.produces
      ? buildProduceSeries(intervals.produces, windowStartMs, windowEndMs, diagnostics)
      : null,
    diagnostics,
  }
}

export function withIndividualProduces(timeline: TimelineData, buckets: readonly ProduceBucket[] | null): TimelineData {
  if (!buckets) return timeline
  const diagnostics = { ...timeline.diagnostics, invalidProduces: 0, producesOutsideWindow: 0 }
  const produces = buildProduceSeries(buckets, timeline.windowStartMs, timeline.windowEndMs, diagnostics)
  return { ...timeline, produces, diagnostics }
}
