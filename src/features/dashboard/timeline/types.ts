export type SegmentKind =
  'runtime' | 'unplanned-production' | 'planned-downtime' | 'unknown-downtime' | 'stoppage' | 'unclassified'

export type SegmentSource = 'runtimes' | 'downtimes' | 'stoppages'

export interface TimelineSegment {
  kind: SegmentKind
  source: SegmentSource
  type: string | null
  name: string | null
  startMs: number
  endMs: number
  sourceStartMs: number
  sourceEndMs: number
  clipped: boolean
}

export const PRODUCE_PASS = 0
export const PRODUCE_FAIL = 1
export const PRODUCE_UNCLASSIFIED = 2

export type ProduceResultCode = typeof PRODUCE_PASS | typeof PRODUCE_FAIL | typeof PRODUCE_UNCLASSIFIED

export interface ProduceSeries {
  timesMs: Float64Array
  resultCodes: Uint8Array
  passCount: number
  failCount: number
  unclassifiedResults: Record<string, number>
}

export interface HourlyProduction {
  bucketStartMs: number
  okCount: number
  ngCount: number
}

export interface TimelineDiagnostics {
  invalidSegments: number
  zeroLengthSegments: number
  segmentsOutsideWindow: number
  clippedSegments: number
  invalidProduces: number
  producesOutsideWindow: number
  invalidProduceCounts: number
}

export interface TimelineData {
  windowStartMs: number
  windowEndMs: number
  segments: TimelineSegment[]
  hourlyProduction: HourlyProduction[]
  produces: ProduceSeries | null
  diagnostics: TimelineDiagnostics
}
