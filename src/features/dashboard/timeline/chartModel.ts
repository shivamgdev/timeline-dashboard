import { PRODUCE_FAIL, PRODUCE_PASS, type ProduceSeries, type TimelineData, type TimelineSegment } from './types'

export const HOURLY_BUCKET_MS = 60 * 60 * 1000

export interface HourlyMarker {
  x: number
  cumulative: number
  bucketStartMs: number
  okCount: number
  ngCount: number
}

export interface IndividualMarkers {
  mode: 'individual'
  passPoints: Float64Array
  failPoints: Float64Array
  passCount: number
  failCount: number
  unclassifiedResults: Record<string, number>
  unclassifiedCount: number
}

export interface HourlyMarkers {
  mode: 'hourly'
  hourly: HourlyMarker[]
  bucketsOutsideWindow: number
}

export interface TimelineChartModel {
  windowStartMs: number
  windowEndMs: number
  segments: readonly TimelineSegment[]
  markers: IndividualMarkers | HourlyMarkers
  yMax: number
}

function buildIndividualMarkers(produces: ProduceSeries): IndividualMarkers {
  const passPoints = new Float64Array(produces.passCount * 2)
  const failPoints = new Float64Array(produces.failCount * 2)
  let passOffset = 0
  let failOffset = 0
  let cumulative = 0

  for (let index = 0; index < produces.timesMs.length; index++) {
    const code = produces.resultCodes[index]
    if (code === PRODUCE_PASS) {
      cumulative++
      passPoints[passOffset++] = produces.timesMs[index]!
      passPoints[passOffset++] = cumulative
    } else if (code === PRODUCE_FAIL) {
      cumulative++
      failPoints[failOffset++] = produces.timesMs[index]!
      failPoints[failOffset++] = cumulative
    }
  }

  return {
    mode: 'individual',
    passPoints,
    failPoints,
    passCount: produces.passCount,
    failCount: produces.failCount,
    unclassifiedResults: produces.unclassifiedResults,
    unclassifiedCount: produces.timesMs.length - produces.passCount - produces.failCount,
  }
}

function buildHourlyMarkers(data: TimelineData): HourlyMarkers {
  const hourly: HourlyMarker[] = []
  let bucketsOutsideWindow = 0
  let cumulative = 0

  for (const bucket of data.hourlyProduction) {
    const bucketEndMs = bucket.bucketStartMs + HOURLY_BUCKET_MS
    if (bucketEndMs <= data.windowStartMs || bucket.bucketStartMs >= data.windowEndMs) {
      bucketsOutsideWindow++
      continue
    }
    cumulative += bucket.okCount + bucket.ngCount
    hourly.push({
      x: Math.min(bucketEndMs, data.windowEndMs),
      cumulative,
      bucketStartMs: bucket.bucketStartMs,
      okCount: bucket.okCount,
      ngCount: bucket.ngCount,
    })
  }

  return { mode: 'hourly', hourly, bucketsOutsideWindow }
}

export function buildTimelineChartModel(data: TimelineData): TimelineChartModel {
  const markers = data.produces ? buildIndividualMarkers(data.produces) : buildHourlyMarkers(data)
  const yMax =
    markers.mode === 'individual' ? markers.passCount + markers.failCount : (markers.hourly.at(-1)?.cumulative ?? 0)
  return {
    windowStartMs: data.windowStartMs,
    windowEndMs: data.windowEndMs,
    segments: data.segments,
    markers,
    yMax,
  }
}
