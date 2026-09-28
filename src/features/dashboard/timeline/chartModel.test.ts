import { describe, expect, it } from 'vitest'
import type { ApiEnvelope } from '../../../api/types'
import machineIntervalsFixture from '../api/__fixtures__/sample-machine-intervals.json'
import type { MachineIntervals, MachineIntervalsResponse, Produce, ProduceBucket } from '../api/analytics.types'
import { normalizeMachineIntervals } from '../utils/machineIntervals'
import { buildTimelineChartModel, HOURLY_BUCKET_MS } from './chartModel'
import { normalizeTimeline } from './normalizeTimeline'

const fixture: ApiEnvelope<MachineIntervalsResponse> = machineIntervalsFixture
const ms = (iso: string) => Date.parse(iso)

function pairs(points: Float64Array): [number, number][] {
  const result: [number, number][] = []
  for (let index = 0; index < points.length; index += 2) result.push([points[index]!, points[index + 1]!])
  return result
}

describe('buildTimelineChartModel — individual produces (client fixture)', () => {
  const window = { startMs: ms('2026-06-23T07:00:00Z'), endMs: ms('2026-06-23T19:00:00Z') }
  const timeline = normalizeTimeline(normalizeMachineIntervals(fixture.data), window)
  const model = buildTimelineChartModel(timeline)

  it('places every PASS and FAIL marker at its time with a cumulative count', () => {
    if (model.markers.mode !== 'individual') throw new Error('expected individual markers')
    expect(pairs(model.markers.passPoints)).toEqual([
      [ms('2026-06-23T07:37:37Z'), 1],
      [ms('2026-06-23T07:39:37Z'), 2],
      [ms('2026-06-23T08:12:19Z'), 4],
    ])
    expect(pairs(model.markers.failPoints)).toEqual([
      [ms('2026-06-23T07:41:02Z'), 3],
      [ms('2026-06-23T08:41:55Z'), 5],
    ])
    expect(model.yMax).toBe(5)
  })

  it('draws the bands from the same clipped segments a table would consume', () => {
    expect(model.segments).toBe(timeline.segments)
  })
})

describe('buildTimelineChartModel — hourly produce counts (client fixture)', () => {
  const produceCountsOnly: MachineIntervals = { ...normalizeMachineIntervals(fixture.data), produces: null }

  it('places each bucket at its end with the cumulative total, overlaying FAIL where ng > 0', () => {
    const window = { startMs: ms('2026-06-23T07:00:00Z'), endMs: ms('2026-06-23T19:00:00Z') }
    const model = buildTimelineChartModel(normalizeTimeline(produceCountsOnly, window))
    if (model.markers.mode !== 'hourly') throw new Error('expected hourly markers')
    expect(model.markers.hourly).toEqual([
      {
        x: ms('2026-06-23T08:00:00Z'),
        cumulative: 37,
        bucketStartMs: ms('2026-06-23T07:00:00Z'),
        okCount: 37,
        ngCount: 0,
      },
      {
        x: ms('2026-06-23T09:00:00Z'),
        cumulative: 92,
        bucketStartMs: ms('2026-06-23T08:00:00Z'),
        okCount: 52,
        ngCount: 3,
      },
      {
        x: ms('2026-06-23T10:00:00Z'),
        cumulative: 180,
        bucketStartMs: ms('2026-06-23T09:00:00Z'),
        okCount: 87,
        ngCount: 1,
      },
    ])
    expect(model.yMax).toBe(180)
  })

  it('keeps bucket markers inside the window when a UTC bucket straddles the shift edges', () => {
    const window = { startMs: ms('2026-06-23T07:30:00Z'), endMs: ms('2026-06-23T09:30:00Z') }
    const model = buildTimelineChartModel(normalizeTimeline(produceCountsOnly, window))
    if (model.markers.mode !== 'hourly') throw new Error('expected hourly markers')
    expect(model.markers.hourly.map((point) => point.x)).toEqual([
      ms('2026-06-23T08:00:00Z'),
      ms('2026-06-23T09:00:00Z'),
      window.endMs,
    ])
    expect(model.markers.hourly.every((point) => point.x > window.startMs && point.x <= window.endMs)).toBe(true)
  })

  it('counts buckets that do not overlap the window instead of plotting them', () => {
    const window = { startMs: ms('2026-06-23T09:00:00Z') + HOURLY_BUCKET_MS, endMs: ms('2026-06-23T19:00:00Z') }
    const model = buildTimelineChartModel(normalizeTimeline(produceCountsOnly, window))
    if (model.markers.mode !== 'hourly') throw new Error('expected hourly markers')
    expect(model.markers).toMatchObject({ hourly: [], bucketsOutsideWindow: 3 })
  })
})

describe('buildTimelineChartModel — large synthetic marker set', () => {
  const window = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T13:30:00Z') }
  const span = window.endMs - window.startMs
  const total = 20_000

  function syntheticBuckets(): ProduceBucket[] {
    const produces: Produce[] = []
    for (let index = 0; index < total; index++) {
      const offset = Math.floor(((index * 7919) % total) * (span / total))
      const result = index % 997 === 0 ? 'FAIL' : index % 50 === 0 ? 'WIP' : 'PASS'
      produces.push({
        produce_id: `p${index}`,
        first_seen_ts: new Date(window.startMs + offset).toISOString(),
        result,
        produce_type: result === 'PASS' && index % 10 === 0 ? 'FIRST' : 'WIP',
        part_model_id: 'pm',
      })
    }
    return [{ bucket_start: '2026-06-23T01:00:00Z', part_model_id: 'pm', produces }]
  }

  const buckets = syntheticBuckets()
  const expectedFails = buckets[0]!.produces.filter((produce) => produce.result === 'FAIL').length
  const expectedWip = buckets[0]!.produces.filter((produce) => produce.result === 'WIP').length

  it('keeps every FAIL marker and every PASS marker (no thinning)', () => {
    const intervals: MachineIntervals = {
      machine_ids: [],
      runtimes: [],
      downtimes: [],
      stoppages: [],
      produce_counts: [],
      produces: buckets,
      metrics: null,
    }
    const model = buildTimelineChartModel(normalizeTimeline(intervals, window))
    if (model.markers.mode !== 'individual') throw new Error('expected individual markers')
    expect(model.markers.failPoints.length / 2).toBe(expectedFails)
    expect(model.markers.passPoints.length / 2).toBe(total - expectedFails - expectedWip)
    expect(model.markers.unclassifiedResults).toEqual({ WIP: expectedWip })
  })

  it('produces a time-ordered, strictly increasing cumulative series inside the window', () => {
    const intervals: MachineIntervals = {
      machine_ids: [],
      runtimes: [],
      downtimes: [],
      stoppages: [],
      produce_counts: [],
      produces: buckets,
      metrics: null,
    }
    const model = buildTimelineChartModel(normalizeTimeline(intervals, window))
    if (model.markers.mode !== 'individual') throw new Error('expected individual markers')
    const merged = [...pairs(model.markers.passPoints), ...pairs(model.markers.failPoints)].sort((a, b) => a[1] - b[1])
    expect(merged.map(([, cumulative]) => cumulative)).toEqual(
      Array.from({ length: merged.length }, (_, index) => index + 1),
    )
    for (let index = 1; index < merged.length; index++)
      expect(merged[index]![0]).toBeGreaterThanOrEqual(merged[index - 1]![0])
    expect(merged.every(([time]) => time >= window.startMs && time < window.endMs)).toBe(true)
  })

  it('normalizes and models 20,000 markers quickly enough to stay off the render path', () => {
    const intervals: MachineIntervals = {
      machine_ids: [],
      runtimes: [],
      downtimes: [],
      stoppages: [],
      produce_counts: [],
      produces: buckets,
      metrics: null,
    }
    const started = performance.now()
    buildTimelineChartModel(normalizeTimeline(intervals, window))
    expect(performance.now() - started).toBeLessThan(250)
  })
})
