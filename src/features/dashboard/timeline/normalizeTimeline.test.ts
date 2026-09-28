import { describe, expect, it } from 'vitest'
import type { ApiEnvelope } from '../../../api/types'
import machineIntervalsFixture from '../api/__fixtures__/sample-machine-intervals.json'
import type { MachineIntervals, MachineIntervalsResponse, ProduceBucket } from '../api/analytics.types'
import { normalizeMachineIntervals } from '../utils/machineIntervals'
import { buildShiftSlots, buildShiftWindow } from '../utils/shifts'
import { normalizeTimeline, withIndividualProduces } from './normalizeTimeline'
import { PRODUCE_FAIL, PRODUCE_PASS, PRODUCE_UNCLASSIFIED } from './types'

const fixture: ApiEnvelope<MachineIntervalsResponse> = machineIntervalsFixture
const fixtureIntervals = normalizeMachineIntervals(fixture.data)

const ms = (iso: string) => Date.parse(iso)
const windowOf = (from: string, to: string) => ({ startMs: ms(from), endMs: ms(to) })

function intervals(overrides: Partial<MachineIntervals> = {}): MachineIntervals {
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

const runtime = (start_at: string, end_at: string, type = 'planned') => ({ start_at, end_at, type, runtime_name: null })
const downtime = (start_at: string, end_at: string, type = 'unknown', downtime_name: string | null = 'unknown') => ({
  start_at,
  end_at,
  type,
  downtime_name,
})

describe('normalizeTimeline — client fixture', () => {
  const window = windowOf('2026-06-23T07:00:00Z', '2026-06-23T19:00:00Z')
  const timeline = normalizeTimeline(fixtureIntervals, window)

  it('keeps every fixture segment (all inside the 12:30–00:30 IST window), sorted by start', () => {
    expect(timeline.segments).toHaveLength(7)
    expect(timeline.segments.map((segment) => new Date(segment.startMs).toISOString())).toEqual([
      '2026-06-23T07:00:00.000Z',
      '2026-06-23T07:03:56.000Z',
      '2026-06-23T07:16:54.000Z',
      '2026-06-23T07:23:43.000Z',
      '2026-06-23T08:20:00.000Z',
      '2026-06-23T08:24:48.000Z',
      '2026-06-23T08:39:54.000Z',
    ])
    expect(timeline.segments.every((segment) => !segment.clipped)).toBe(true)
  })

  it('classifies segments by source array and backend type', () => {
    expect(timeline.segments.map((segment) => segment.kind)).toEqual([
      'unknown-downtime',
      'runtime',
      'unknown-downtime',
      'runtime',
      'unplanned-production',
      'unknown-downtime',
      'runtime',
    ])
  })

  it('aggregates hourly produce counts by UTC bucket without mapping them to IST hours', () => {
    expect(timeline.hourlyProduction).toEqual([
      { bucketStartMs: ms('2026-06-23T07:00:00Z'), okCount: 37, ngCount: 0 },
      { bucketStartMs: ms('2026-06-23T08:00:00Z'), okCount: 52, ngCount: 3 },
      { bucketStartMs: ms('2026-06-23T09:00:00Z'), okCount: 87, ngCount: 1 },
    ])
  })

  it('flattens unsorted produces across buckets into time order with PASS/FAIL codes', () => {
    const produces = timeline.produces!
    expect(Array.from(produces.timesMs).map((time) => new Date(time).toISOString().slice(11, 19))).toEqual([
      '07:37:37',
      '07:39:37',
      '07:41:02',
      '08:12:19',
      '08:41:55',
    ])
    expect(Array.from(produces.resultCodes)).toEqual([
      PRODUCE_PASS,
      PRODUCE_PASS,
      PRODUCE_FAIL,
      PRODUCE_PASS,
      PRODUCE_FAIL,
    ])
    expect([produces.passCount, produces.failCount]).toEqual([3, 2])
  })

  it('does not mutate the source response', () => {
    const snapshot = structuredClone(fixture.data)
    normalizeTimeline(fixtureIntervals, window)
    expect(fixture.data).toEqual(snapshot)
  })
})

describe('normalizeTimeline — clipping (synthetic segments)', () => {
  const window = windowOf('2026-06-23T01:30:00Z', '2026-06-23T13:30:00Z')

  it('keeps an interval fully inside the shift unchanged', () => {
    const [segment] = normalizeTimeline(
      intervals({ runtimes: [runtime('2026-06-23T02:00:00Z', '2026-06-23T03:00:00Z')] }),
      window,
    ).segments
    expect(segment).toMatchObject({
      startMs: ms('2026-06-23T02:00:00Z'),
      endMs: ms('2026-06-23T03:00:00Z'),
      clipped: false,
    })
  })

  it('clips an interval that starts before the shift', () => {
    const [segment] = normalizeTimeline(
      intervals({ downtimes: [downtime('2026-06-23T00:45:00Z', '2026-06-23T02:00:00Z')] }),
      window,
    ).segments
    expect(segment).toMatchObject({
      startMs: window.startMs,
      endMs: ms('2026-06-23T02:00:00Z'),
      sourceStartMs: ms('2026-06-23T00:45:00Z'),
      clipped: true,
    })
  })

  it('clips an interval that ends after the shift (shape observed live: last segment ends 13:54:05Z)', () => {
    const result = normalizeTimeline(
      intervals({ runtimes: [runtime('2026-06-23T13:20:00Z', '2026-06-23T13:54:05Z')] }),
      window,
    )
    expect(result.segments[0]).toMatchObject({
      startMs: ms('2026-06-23T13:20:00Z'),
      endMs: window.endMs,
      clipped: true,
    })
    expect(result.diagnostics.clippedSegments).toBe(1)
  })

  it('clips an interval spanning the complete shift to exactly the shift', () => {
    const [segment] = normalizeTimeline(
      intervals({ runtimes: [runtime('2026-06-22T20:00:00Z', '2026-06-23T20:00:00Z')] }),
      window,
    ).segments
    expect(segment).toMatchObject({ startMs: window.startMs, endMs: window.endMs, clipped: true })
  })

  it('drops intervals entirely outside the shift and counts them', () => {
    const result = normalizeTimeline(
      intervals({
        runtimes: [
          runtime('2026-06-23T00:00:00Z', '2026-06-23T01:30:00Z'),
          runtime('2026-06-23T13:30:00Z', '2026-06-23T14:00:00Z'),
        ],
      }),
      window,
    )
    expect(result.segments).toEqual([])
    expect(result.diagnostics.segmentsOutsideWindow).toBe(2)
  })

  it('clips against an overnight IST shift built from the shift utilities', () => {
    const slots = buildShiftSlots({ id: 's', code: 's', name: 's', shift_timings: ['07:00', '19:00'], is_active: true })
    if (!slots.ok) throw new Error(slots.error)
    const overnight = buildShiftWindow('2026-06-23', slots.slots[1]!)
    const result = normalizeTimeline(
      intervals({
        runtimes: [runtime('2026-06-23T13:00:00Z', '2026-06-23T14:00:00Z')],
        downtimes: [downtime('2026-06-24T01:00:00Z', '2026-06-24T04:58:43Z')],
      }),
      overnight,
    )
    expect(
      result.segments.map((segment) => [
        new Date(segment.startMs).toISOString(),
        new Date(segment.endMs).toISOString(),
      ]),
    ).toEqual([
      ['2026-06-23T13:30:00.000Z', '2026-06-23T14:00:00.000Z'],
      ['2026-06-24T01:00:00.000Z', '2026-06-24T01:30:00.000Z'],
    ])
  })

  it('never produces a segment outside the window', () => {
    const result = normalizeTimeline(
      intervals({
        runtimes: [runtime('2026-06-22T00:00:00Z', '2026-06-25T00:00:00Z')],
        downtimes: [downtime('2026-06-23T13:29:59Z', '2026-06-23T13:30:01Z')],
      }),
      window,
    )
    expect(result.segments.every((segment) => segment.startMs >= window.startMs && segment.endMs <= window.endMs)).toBe(
      true,
    )
  })

  it('keeps the tiled fixture segments summing to the covered span', () => {
    const window = windowOf('2026-06-23T07:00:00Z', '2026-06-23T10:18:34Z')
    const result = normalizeTimeline(fixtureIntervals, window)
    const covered = result.segments.reduce((total, segment) => total + segment.endMs - segment.startMs, 0)
    expect(covered).toBe(window.endMs - window.startMs)
  })
})

describe('normalizeTimeline — invalid, zero-length and empty data (synthetic)', () => {
  const window = windowOf('2026-06-23T01:30:00Z', '2026-06-23T13:30:00Z')

  it('handles an empty response', () => {
    expect(normalizeTimeline(intervals(), window)).toMatchObject({ segments: [], hourlyProduction: [], produces: null })
  })

  it('handles the live empty-asset payload after API normalization (null collections)', () => {
    const live = normalizeMachineIntervals({
      machine_ids: [],
      runtimes: [],
      stoppages: [],
      downtimes: [],
      produce_counts: null,
      produces: null,
      metrics: null,
    })
    expect(normalizeTimeline(live, window).hourlyProduction).toEqual([])
  })

  it('skips and counts zero-length intervals instead of drawing them', () => {
    const result = normalizeTimeline(
      intervals({ runtimes: [runtime('2026-06-23T02:00:00Z', '2026-06-23T02:00:00Z')] }),
      window,
    )
    expect(result.segments).toEqual([])
    expect(result.diagnostics.zeroLengthSegments).toBe(1)
  })

  it('skips and counts reversed, missing and offset-less timestamps', () => {
    const malformed: MachineIntervals = JSON.parse(`{
      "machine_ids": [], "downtimes": [], "stoppages": [], "produce_counts": [], "produces": null, "metrics": null,
      "runtimes": [
        { "start_at": "2026-06-23T03:00:00Z", "end_at": "2026-06-23T02:00:00Z", "type": "planned", "runtime_name": null },
        { "start_at": "2026-06-23T02:00:00", "end_at": "2026-06-23T03:00:00Z", "type": "planned", "runtime_name": null },
        { "start_at": null, "end_at": "2026-06-23T03:00:00Z", "type": "planned", "runtime_name": null }
      ]
    }`)
    const result = normalizeTimeline(malformed, window)
    expect(result.segments).toEqual([])
    expect(result.diagnostics.invalidSegments).toBe(3)
  })

  it('marks unknown backend types as unclassified and keeps their raw type', () => {
    const result = normalizeTimeline(
      intervals({ downtimes: [downtime('2026-06-23T02:00:00Z', '2026-06-23T03:00:00Z', 'breakdown', 'Motor')] }),
      window,
    )
    expect(result.segments[0]).toMatchObject({
      kind: 'unclassified',
      source: 'downtimes',
      type: 'breakdown',
      name: 'Motor',
    })
  })

  it('does not treat inherited object keys as known segment types', () => {
    const result = normalizeTimeline(
      intervals({ runtimes: [runtime('2026-06-23T02:00:00Z', '2026-06-23T03:00:00Z', 'constructor')] }),
      window,
    )
    expect(result.segments[0]?.kind).toBe('unclassified')
  })

  it('classifies planned downtimes (observed live: TEA BREAK, LUNCH BREAK) with their names', () => {
    const result = normalizeTimeline(
      intervals({ downtimes: [downtime('2026-06-23T04:00:00Z', '2026-06-23T04:10:00Z', 'planned', 'TEA BREAK')] }),
      window,
    )
    expect(result.segments[0]).toMatchObject({ kind: 'planned-downtime', name: 'TEA BREAK' })
  })

  it('renders stoppages only when they carry valid start/end timestamps (shape unverified live)', () => {
    const result = normalizeTimeline(
      intervals({
        stoppages: [
          { start_at: '2026-06-23T05:00:00Z', end_at: '2026-06-23T05:02:00Z', reason: 'jam' },
          { start_at: 'bad', end_at: '2026-06-23T05:02:00Z' },
        ],
      }),
      window,
    )
    expect(result.segments).toEqual([expect.objectContaining({ kind: 'stoppage', source: 'stoppages' })])
    expect(result.diagnostics.invalidSegments).toBe(1)
  })

  it('skips invalid hourly counts and aggregates across part models', () => {
    const result = normalizeTimeline(
      intervals({
        produce_counts: [
          { bucket_start: '2026-06-23T03:00:00Z', part_model_id: 'a', ok_count: 10, ng_count: 1 },
          { bucket_start: '2026-06-23T03:00:00Z', part_model_id: 'b', ok_count: 5, ng_count: 0 },
          { bucket_start: 'nope', part_model_id: 'a', ok_count: 1, ng_count: 0 },
        ],
      }),
      window,
    )
    expect(result.hourlyProduction).toEqual([{ bucketStartMs: ms('2026-06-23T03:00:00Z'), okCount: 15, ngCount: 1 }])
    expect(result.diagnostics.invalidProduceCounts).toBe(1)
  })
})

describe('normalizeTimeline — produces (synthetic rows mirroring the live result values)', () => {
  const window = windowOf('2026-06-23T01:30:00Z', '2026-06-23T13:30:00Z')
  const row = (first_seen_ts: string, result: string, produce_type = 'FIRST') => ({
    produce_id: first_seen_ts,
    first_seen_ts,
    result,
    produce_type,
    part_model_id: 'pm',
  })

  it('keeps WIP results as unclassified instead of PASS or FAIL', () => {
    const buckets: ProduceBucket[] = [
      {
        bucket_start: '2026-06-23T03:00:00Z',
        part_model_id: 'pm',
        produces: [
          row('2026-06-23T03:10:00Z', 'WIP', 'WIP'),
          row('2026-06-23T03:05:00Z', 'PASS', 'WIP'),
          row('2026-06-23T03:20:00Z', 'FAIL', 'WIP'),
        ],
      },
    ]
    const produces = normalizeTimeline(intervals({ produces: buckets }), window).produces!
    expect(Array.from(produces.resultCodes)).toEqual([PRODUCE_PASS, PRODUCE_UNCLASSIFIED, PRODUCE_FAIL])
    expect(produces).toMatchObject({ passCount: 1, failCount: 1, unclassifiedResults: { WIP: 1 } })
  })

  it('excludes produces outside the shift window and invalid timestamps, counting both', () => {
    const buckets: ProduceBucket[] = [
      {
        bucket_start: '2026-06-23T13:00:00Z',
        part_model_id: 'pm',
        produces: [row('2026-06-23T13:29:59Z', 'PASS'), row('2026-06-23T13:30:00Z', 'FAIL'), row('invalid', 'FAIL')],
      },
    ]
    const result = normalizeTimeline(intervals({ produces: buckets }), window)
    expect(result.produces?.timesMs.length).toBe(1)
    expect(result.diagnostics).toMatchObject({ producesOutsideWindow: 1, invalidProduces: 1 })
  })
})

describe('withIndividualProduces — client fixture', () => {
  const window = windowOf('2026-06-23T07:00:00Z', '2026-06-23T19:00:00Z')

  it('adds the same produce series as normalizing the exact response, without touching segments or counts', () => {
    const summary = normalizeTimeline({ ...fixtureIntervals, produces: null }, window)
    const merged = withIndividualProduces(summary, fixtureIntervals.produces)
    const direct = normalizeTimeline(fixtureIntervals, window)
    expect(merged.produces).toEqual(direct.produces)
    expect(merged.segments).toBe(summary.segments)
    expect(merged.hourlyProduction).toBe(summary.hourlyProduction)
    expect(merged.diagnostics).toEqual(direct.diagnostics)
    expect(summary.produces).toBeNull()
  })

  it('returns the summary unchanged when there are no produce buckets', () => {
    const summary = normalizeTimeline({ ...fixtureIntervals, produces: null }, window)
    expect(withIndividualProduces(summary, null)).toBe(summary)
    expect(withIndividualProduces(summary, []).produces?.timesMs.length).toBe(0)
  })
})
