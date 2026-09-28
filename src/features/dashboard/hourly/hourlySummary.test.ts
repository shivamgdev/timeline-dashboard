import { describe, expect, it } from 'vitest'
import type { ApiEnvelope } from '../../../api/types'
import cycleTimeFixture from '../api/__fixtures__/sample-analytics-query-cycle-time.json'
import machineIntervalsFixture from '../api/__fixtures__/sample-machine-intervals.json'
import type { CycleTimeBucket, MachineIntervals, MachineIntervalsResponse } from '../api/analytics.types'
import { normalizeTimeline } from '../timeline/normalizeTimeline'
import { normalizeMachineIntervals } from '../utils/machineIntervals'
import { buildClockHourBoundaries, buildHourlyBoundaries } from './columns'
import { buildHourlySummary, normalizeCycleTimes } from './hourlySummary'

const intervalsEnvelope: ApiEnvelope<MachineIntervalsResponse> = machineIntervalsFixture
const cycleEnvelope: ApiEnvelope<CycleTimeBucket[]> = cycleTimeFixture

const ms = (iso: string) => Date.parse(iso)
const MIN = 60_000
const SEC = 1_000
const AFTER_WINDOW = ms('2026-06-24T00:00:00Z')

const sampleWindow = { startMs: ms('2026-06-23T07:00:00Z'), endMs: ms('2026-06-23T19:00:00Z') }
const sampleTimeline = normalizeTimeline(normalizeMachineIntervals(intervalsEnvelope.data), sampleWindow)
const sampleBoundaries = buildHourlyBoundaries(sampleWindow.startMs, sampleWindow.endMs, sampleWindow.startMs)

function emptyIntervals(overrides: Partial<MachineIntervals> = {}): MachineIntervals {
  return {
    machine_ids: [],
    runtimes: [],
    downtimes: [],
    stoppages: [],
    produce_counts: [],
    produces: null,
    metrics: null,
    ...overrides,
  }
}

describe('buildHourlySummary — client fixtures (sample shift 12:30–00:30 IST)', () => {
  const summary = buildHourlySummary({
    timeline: sampleTimeline,
    cycleTimes: cycleEnvelope.data,
    boundaries: sampleBoundaries,
    nowMs: AFTER_WINDOW,
  })

  it('splits the tiled fixture segments into per-kind minutes for each column', () => {
    const [first, second, third, fourth] = summary.columns
    expect(first!.durationsMs).toMatchObject({ runtime: 49 * MIN + 15 * SEC, 'unknown-downtime': 10 * MIN + 45 * SEC })
    expect(second!.durationsMs).toMatchObject({
      runtime: 40 * MIN + 6 * SEC,
      'unplanned-production': 4 * MIN + 48 * SEC,
      'unknown-downtime': 15 * MIN + 6 * SEC,
    })
    expect(third!.durationsMs).toMatchObject({ runtime: 60 * MIN, 'unknown-downtime': 0 })
    expect(fourth!.durationsMs?.runtime).toBe(18 * MIN + 34 * SEC)
  })

  it('adds up to the full hour wherever the fixture covers the whole column', () => {
    for (const column of summary.columns.slice(0, 3)) {
      const covered = Object.values(column.durationsMs!).reduce((total, value) => total + value, 0)
      expect(covered).toBe(60 * MIN)
    }
  })

  it('takes Pass/Fail/Total from ok_count/ng_count, not from individual produce rows', () => {
    expect(summary.columns.slice(0, 4).map((column) => column.production)).toEqual([
      { okCount: 37, ngCount: 0, total: 37 },
      { okCount: 52, ngCount: 3, total: 55 },
      { okCount: 87, ngCount: 1, total: 88 },
      { okCount: 0, ngCount: 0, total: 0 },
    ])
    expect(sampleTimeline.produces?.failCount).toBe(2)
  })

  it('matches cycle times by bucket_start and leaves null values blank', () => {
    expect(summary.columns.slice(0, 4).map((column) => column.cycleTime)).toEqual([
      { idealSeconds: 307, actualSeconds: 412.5 },
      { idealSeconds: 307, actualSeconds: 389.2 },
      { idealSeconds: null, actualSeconds: null },
      { idealSeconds: null, actualSeconds: null },
    ])
  })

  it('marks every column of a finished shift complete and reports nothing unassigned', () => {
    expect(summary.columns.every((column) => column.state === 'complete' && column.elapsedMs === 60 * MIN)).toBe(true)
    expect(summary).toMatchObject({
      unassignedProduction: [],
      unassignedCycleTimes: [],
      columnsWithMultipleCycleTimes: [],
      invalidCycleTimes: 0,
    })
  })
})

const cycle = (bucket_start: string): CycleTimeBucket => ({
  entity_type: 'asset',
  entity_id: 'e',
  asset_level_id: 20,
  bucket_start,
  ideal_cycle_time_seconds: 37,
  actual_cycle_time_seconds: 29,
})

describe('buildHourlySummary — synthetic cases (labelled; not from the client fixtures)', () => {
  it('reproduces the written example: 08:33 → 10:12 IST runtime is 27 / 60 / 12 min in clock-hour columns', () => {
    const window = { startMs: ms('2026-06-23T02:30:00Z'), endMs: ms('2026-06-23T05:30:00Z') }
    const timeline = normalizeTimeline(
      emptyIntervals({
        runtimes: [
          { start_at: '2026-06-23T03:03:00Z', end_at: '2026-06-23T04:42:00Z', type: 'planned', runtime_name: null },
        ],
      }),
      window,
    )
    const summary = buildHourlySummary({
      timeline,
      cycleTimes: [],
      boundaries: buildHourlyBoundaries(window.startMs, window.endMs, window.startMs),
      nowMs: AFTER_WINDOW,
    })
    expect(summary.columns.map((column) => column.durationsMs!.runtime / MIN)).toEqual([27, 60, 12])
  })

  it('leaves columns after "now" blank and fills the current column only up to now', () => {
    const nowMs = ms('2026-06-23T08:30:00Z')
    const summary = buildHourlySummary({
      timeline: sampleTimeline,
      cycleTimes: cycleEnvelope.data,
      boundaries: sampleBoundaries,
      nowMs,
    })
    const [first, current, next, last] = [
      summary.columns[0]!,
      summary.columns[1]!,
      summary.columns[2]!,
      summary.columns.at(-1)!,
    ]
    expect(first.state).toBe('complete')
    expect(current).toMatchObject({ state: 'in-progress', elapsedMs: 30 * MIN })
    expect(current.durationsMs).toMatchObject({
      runtime: 20 * MIN,
      'unplanned-production': 4 * MIN + 48 * SEC,
      'unknown-downtime': 5 * MIN + 12 * SEC,
    })
    for (const column of [next, last]) {
      expect(column).toMatchObject({
        state: 'future',
        elapsedMs: null,
        durationsMs: null,
        production: null,
        cycleTime: null,
      })
    }
    expect(summary.unassignedProduction).toEqual([])
    expect(summary.unassignedCycleTimes).toEqual([])
  })

  it('does not fill buckets that start at or after "now" inside the in-progress clock-hour column', () => {
    const clockBoundaries = buildClockHourBoundaries(sampleWindow.startMs, sampleWindow.endMs)
    const atBucketStart = buildHourlySummary({
      timeline: sampleTimeline,
      cycleTimes: cycleEnvelope.data,
      boundaries: clockBoundaries,
      nowMs: ms('2026-06-23T08:00:00Z'),
    })
    expect(atBucketStart.columns[1]).toMatchObject({
      state: 'in-progress',
      production: { okCount: 0, ngCount: 0, total: 0 },
      cycleTime: { idealSeconds: null, actualSeconds: null },
    })
    expect(atBucketStart.columns[0]!.production).toEqual({ okCount: 37, ngCount: 0, total: 37 })
    expect(atBucketStart.unassignedProduction).toEqual([])

    const afterBucketStart = buildHourlySummary({
      timeline: sampleTimeline,
      cycleTimes: cycleEnvelope.data,
      boundaries: clockBoundaries,
      nowMs: ms('2026-06-23T08:10:00Z'),
    })
    expect(afterBucketStart.columns[1]).toMatchObject({
      state: 'in-progress',
      production: { okCount: 52, ngCount: 3, total: 55 },
      cycleTime: { idealSeconds: 307, actualSeconds: 389.2 },
    })
  })

  it('ignores individual produces entirely, so WIP and WIP-type FAIL rows never change Pass/Fail', () => {
    const window = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T02:30:00Z') }
    const produce = (first_seen_ts: string, result: string, produce_type: string) => ({
      produce_id: first_seen_ts,
      first_seen_ts,
      result,
      produce_type,
      part_model_id: 'pm',
    })
    const timeline = normalizeTimeline(
      emptyIntervals({
        produce_counts: [{ bucket_start: '2026-06-23T01:30:00Z', part_model_id: 'pm', ok_count: 4, ng_count: 0 }],
        produces: [
          {
            bucket_start: '2026-06-23T01:30:00Z',
            part_model_id: 'pm',
            produces: [
              produce('2026-06-23T01:40:00Z', 'WIP', 'WIP'),
              produce('2026-06-23T01:41:00Z', 'FAIL', 'WIP'),
              produce('2026-06-23T01:42:00Z', 'PASS', 'FIRST'),
            ],
          },
        ],
      }),
      window,
    )
    const summary = buildHourlySummary({
      timeline,
      cycleTimes: [],
      boundaries: [window.startMs, window.endMs],
      nowMs: AFTER_WINDOW,
    })
    expect(summary.columns[0]!.production).toEqual({ okCount: 4, ngCount: 0, total: 4 })
  })

  it('reports every segment kind without choosing table rows (planned downtime, stoppage, unclassified)', () => {
    const window = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T02:30:00Z') }
    const timeline = normalizeTimeline(
      emptyIntervals({
        downtimes: [
          {
            start_at: '2026-06-23T01:30:00Z',
            end_at: '2026-06-23T01:50:00Z',
            type: 'planned',
            downtime_name: 'TEA BREAK',
          },
          { start_at: '2026-06-23T01:50:00Z', end_at: '2026-06-23T02:00:00Z', type: 'breakdown', downtime_name: null },
        ],
        stoppages: [{ start_at: '2026-06-23T02:00:00Z', end_at: '2026-06-23T02:05:00Z' }],
        runtimes: [
          { start_at: '2026-06-23T02:05:00Z', end_at: '2026-06-23T02:30:00Z', type: 'planned', runtime_name: null },
        ],
      }),
      window,
    )
    const [column] = buildHourlySummary({
      timeline,
      cycleTimes: [],
      boundaries: [window.startMs, window.endMs],
      nowMs: AFTER_WINDOW,
    }).columns
    expect(column!.durationsMs).toEqual({
      runtime: 25 * MIN,
      'unplanned-production': 0,
      'planned-downtime': 20 * MIN,
      'unknown-downtime': 0,
      stoppage: 5 * MIN,
      unclassified: 10 * MIN,
    })
  })

  it('assigns a bucket that starts before the window but overlaps it to the first column (live night-shift shape)', () => {
    const window = { startMs: ms('2026-06-23T13:30:00Z'), endMs: ms('2026-06-23T15:30:00Z') }
    const timeline = normalizeTimeline(
      emptyIntervals({
        produce_counts: [
          { bucket_start: '2026-06-23T13:00:00Z', part_model_id: 'pm', ok_count: 6, ng_count: 0 },
          { bucket_start: '2026-06-23T14:00:00Z', part_model_id: 'pm', ok_count: 86, ng_count: 0 },
        ],
      }),
      window,
    )
    const summary = buildHourlySummary({
      timeline,
      cycleTimes: [cycle('2026-06-23T13:00:00Z')],
      boundaries: buildClockHourBoundaries(window.startMs, window.endMs),
      nowMs: AFTER_WINDOW,
    })
    expect(summary.columns.map((column) => column.production?.total)).toEqual([92, 0])
    expect(summary.columns[0]!.cycleTime).toEqual({ idealSeconds: 37, actualSeconds: 29 })
    expect(summary.unassignedProduction).toEqual([])
    expect(summary.unassignedCycleTimes).toEqual([])
  })

  it('reports buckets that do not overlap any column instead of dropping them', () => {
    const window = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T03:30:00Z') }
    const timeline = normalizeTimeline(
      emptyIntervals({
        produce_counts: [
          { bucket_start: '2026-06-23T00:00:00Z', part_model_id: 'pm', ok_count: 6, ng_count: 0 },
          { bucket_start: '2026-06-23T02:00:00Z', part_model_id: 'pm', ok_count: 9, ng_count: 1 },
          { bucket_start: '2026-06-23T03:30:00Z', part_model_id: 'pm', ok_count: 2, ng_count: 0 },
        ],
      }),
      window,
    )
    const summary = buildHourlySummary({
      timeline,
      cycleTimes: [cycle('2026-06-23T00:00:00Z'), cycle('2026-06-23T02:00:00Z')],
      boundaries: buildHourlyBoundaries(window.startMs, window.endMs, window.startMs),
      nowMs: AFTER_WINDOW,
    })
    expect(summary.unassignedProduction.map((bucket) => bucket.bucketStartMs)).toEqual([
      ms('2026-06-23T00:00:00Z'),
      ms('2026-06-23T03:30:00Z'),
    ])
    expect(summary.unassignedCycleTimes.map((entry) => entry.bucketStartMs)).toEqual([ms('2026-06-23T00:00:00Z')])
    expect(summary.columns[0]!.production).toEqual({ okCount: 9, ngCount: 1, total: 10 })
  })

  it('leaves a cycle-time cell blank and flags it when several buckets fall into one column', () => {
    const window = { startMs: ms('2026-06-23T01:00:00Z'), endMs: ms('2026-06-23T03:00:00Z') }
    const cycle = (bucket_start: string, ideal: number): CycleTimeBucket => ({
      entity_type: 'asset',
      entity_id: 'e',
      asset_level_id: 20,
      bucket_start,
      ideal_cycle_time_seconds: ideal,
      actual_cycle_time_seconds: ideal,
    })
    const summary = buildHourlySummary({
      timeline: normalizeTimeline(emptyIntervals(), window),
      cycleTimes: [cycle('2026-06-23T01:00:00Z', 30), cycle('2026-06-23T02:00:00Z', 40)],
      boundaries: [window.startMs, window.endMs],
      nowMs: AFTER_WINDOW,
    })
    expect(summary.columns[0]!.cycleTime).toEqual({ idealSeconds: null, actualSeconds: null })
    expect(summary.columnsWithMultipleCycleTimes).toEqual([0])
  })

  it('rejects boundaries that are too few or not increasing', () => {
    const timeline = normalizeTimeline(emptyIntervals(), sampleWindow)
    expect(() => buildHourlySummary({ timeline, cycleTimes: [], boundaries: [1], nowMs: 0 })).toThrow(RangeError)
    expect(() => buildHourlySummary({ timeline, cycleTimes: [], boundaries: [2, 2], nowMs: 0 })).toThrow(RangeError)
  })
})

describe('normalizeCycleTimes', () => {
  it('keeps null metrics as null and counts unparseable bucket starts', () => {
    const malformed: CycleTimeBucket[] = JSON.parse(
      '[{"entity_type":"asset","entity_id":"e","asset_level_id":20,"bucket_start":"2026-06-23T09:00:00Z","ideal_cycle_time_seconds":null,"actual_cycle_time_seconds":"n/a"},' +
        '{"entity_type":"asset","entity_id":"e","asset_level_id":20,"bucket_start":"bad","ideal_cycle_time_seconds":1,"actual_cycle_time_seconds":1}]',
    )
    expect(normalizeCycleTimes(malformed)).toEqual({
      entries: [{ bucketStartMs: ms('2026-06-23T09:00:00Z'), idealSeconds: null, actualSeconds: null }],
      invalid: 1,
    })
  })
})

describe('live-shaped bucket mapping (synthetic data shaped like the live backend: UTC-hour buckets = :30 IST)', () => {
  const counts = (starts: string[]) =>
    starts.map((bucket_start, index) => ({
      bucket_start,
      part_model_id: 'pm',
      ok_count: 10 + index,
      ng_count: index % 2,
    }))

  it('07:00–19:00 IST shift: 12 clock-hour columns; each bucket goes to the hour containing its IST bucket_start', () => {
    const window = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T13:30:00Z') }
    const starts = Array.from({ length: 11 }, (_, index) =>
      new Date(ms('2026-06-23T03:00:00Z') + index * 3_600_000).toISOString(),
    )
    const summary = buildHourlySummary({
      timeline: normalizeTimeline(emptyIntervals({ produce_counts: counts(starts) }), window),
      cycleTimes: starts.map((bucket_start) => ({ ...cycle(bucket_start), ideal_cycle_time_seconds: 37 })),
      boundaries: buildClockHourBoundaries(window.startMs, window.endMs),
      nowMs: AFTER_WINDOW,
    })
    expect(summary.columns).toHaveLength(12)
    expect(summary.columns.map((column) => column.production!.total)).toEqual([
      0, 10, 12, 12, 14, 14, 16, 16, 18, 18, 20, 20,
    ])
    expect(summary.columns.map((column) => column.cycleTime!.idealSeconds)).toEqual([
      null,
      37,
      37,
      37,
      37,
      37,
      37,
      37,
      37,
      37,
      37,
      37,
    ])
    expect(summary.unassignedProduction).toEqual([])
  })

  it('19:00–07:00 IST overnight shift: columns cross midnight; the 18:30 IST bucket lands in 19:00–20:00', () => {
    const window = { startMs: ms('2026-06-23T13:30:00Z'), endMs: ms('2026-06-24T01:30:00Z') }
    const summary = buildHourlySummary({
      timeline: normalizeTimeline(
        emptyIntervals({
          produce_counts: counts(['2026-06-23T13:00:00Z', '2026-06-23T18:00:00Z', '2026-06-24T01:00:00Z']),
        }),
        window,
      ),
      cycleTimes: [],
      boundaries: buildClockHourBoundaries(window.startMs, window.endMs),
      nowMs: ms('2026-06-25T00:00:00Z'),
    })
    expect(summary.columns).toHaveLength(12)
    const totals = summary.columns.map((column) => column.production!.total)
    expect(totals[0]).toBe(10)
    expect(totals[4]).toBe(12)
    expect(totals[11]).toBe(12)
    expect(totals.reduce((a, b) => a + b, 0)).toBe(34)
  })
})

describe('chart and table consistency (ASG 2.3: "The chart bands and the hourly table must agree")', () => {
  it('distributes exactly the clipped segment durations the timeline draws across the clock-hour columns', () => {
    const summary = buildHourlySummary({
      timeline: sampleTimeline,
      cycleTimes: [],
      boundaries: buildClockHourBoundaries(sampleWindow.startMs, sampleWindow.endMs),
      nowMs: AFTER_WINDOW,
    })
    const tableTotals: Record<string, number> = {}
    for (const column of summary.columns) {
      for (const [kind, value] of Object.entries(column.durationsMs!))
        tableTotals[kind] = (tableTotals[kind] ?? 0) + value
    }
    const chartTotals: Record<string, number> = {}
    for (const segment of sampleTimeline.segments) {
      chartTotals[segment.kind] = (chartTotals[segment.kind] ?? 0) + segment.endMs - segment.startMs
    }
    for (const [kind, total] of Object.entries(chartTotals)) expect(tableTotals[kind]).toBe(total)
  })
})
