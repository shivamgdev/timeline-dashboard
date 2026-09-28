import { describe, expect, it } from 'vitest'
import type { ApiEnvelope } from '../../../api/types'
import machineIntervalsFixture from '../api/__fixtures__/sample-machine-intervals.json'
import type { MachineIntervals, MachineIntervalsResponse } from '../api/analytics.types'
import { normalizeTimeline } from '../timeline/normalizeTimeline'
import { normalizeMachineIntervals } from '../utils/machineIntervals'
import { buildClockHourBoundaries } from './columns'
import { buildHourlySummary } from './hourlySummary'
import { checkHourlySanity } from './sanity'

const ms = (iso: string) => Date.parse(iso)
const MIN = 60_000
const AFTER = ms('2026-06-24T00:00:00Z')
const fixture: ApiEnvelope<MachineIntervalsResponse> = machineIntervalsFixture

function intervals(overrides: Partial<MachineIntervals>): MachineIntervals {
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
const downtime = (start_at: string, end_at: string, type = 'unknown', downtime_name: string | null = null) => ({
  start_at,
  end_at,
  type,
  downtime_name,
})

function sanityFor(data: MachineIntervals, from: string, to: string, nowMs = AFTER) {
  const window = { startMs: ms(from), endMs: ms(to) }
  const summary = buildHourlySummary({
    timeline: normalizeTimeline(data, window),
    cycleTimes: [],
    boundaries: buildClockHourBoundaries(window.startMs, window.endMs),
    nowMs,
  })
  return { summary, sanity: checkHourlySanity(summary) }
}

describe('checkHourlySanity (ASG 2.4: runtime + unplanned production + stoppage + unknown ≈ 60 per elapsed hour)', () => {
  it('passes a fully tiled 60-minute hour', () => {
    const { sanity } = sanityFor(
      intervals({
        runtimes: [
          runtime('2026-06-23T01:30:00Z', '2026-06-23T02:00:00Z'),
          runtime('2026-06-23T02:00:00Z', '2026-06-23T02:10:00Z', 'unknown unplanned production'),
        ],
        downtimes: [downtime('2026-06-23T02:10:00Z', '2026-06-23T02:25:00Z')],
        stoppages: [{ start_at: '2026-06-23T02:25:00Z', end_at: '2026-06-23T02:30:00Z' }],
      }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T02:30:00Z',
    )
    expect(sanity.checked[0]).toMatchObject({ expectedMs: 60 * MIN, specifiedKindsMs: 60 * MIN, uncoveredMs: 0 })
    expect(sanity.withinTolerance).toEqual([0])
  })

  it('accepts rounding within ±1 minute', () => {
    const { sanity } = sanityFor(
      intervals({ runtimes: [runtime('2026-06-23T01:30:00Z', '2026-06-23T02:29:30Z')] }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T02:30:00Z',
    )
    expect(sanity.withinTolerance).toEqual([0])
  })

  it('attributes a short hour to planned downtime without moving its minutes into another row', () => {
    const { summary, sanity } = sanityFor(
      intervals({
        runtimes: [runtime('2026-06-23T01:30:00Z', '2026-06-23T02:10:00Z')],
        downtimes: [downtime('2026-06-23T02:10:00Z', '2026-06-23T02:30:00Z', 'planned', 'LUNCH BREAK')],
      }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T02:30:00Z',
    )
    expect(sanity.checked[0]).toMatchObject({ specifiedKindsMs: 40 * MIN, plannedDowntimeMs: 20 * MIN, uncoveredMs: 0 })
    expect(sanity.explainedByOtherKinds).toEqual([0])
    expect(summary.columns[0]!.durationsMs).toMatchObject({
      runtime: 40 * MIN,
      'planned-downtime': 20 * MIN,
      'unknown-downtime': 0,
    })
  })

  it('checks an in-progress hour against its elapsed minutes and skips future hours', () => {
    const { sanity } = sanityFor(
      intervals({ runtimes: [runtime('2026-06-23T01:30:00Z', '2026-06-23T02:00:00Z')] }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T03:30:00Z',
      ms('2026-06-23T02:00:00Z'),
    )
    expect(sanity.checked).toEqual([])
    const complete = sanityFor(
      intervals({ runtimes: [runtime('2026-06-23T01:30:00Z', '2026-06-23T02:45:00Z')] }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T03:30:00Z',
      ms('2026-06-23T02:45:00Z'),
    )
    expect(complete.summary.columns.map((column) => column.state)).toEqual(['complete', 'in-progress'])
    expect(complete.sanity.checked.map((hour) => hour.columnIndex)).toEqual([0])
    expect(complete.sanity.withinTolerance).toEqual([0])
  })

  it('uses the clipped segment, so an interval running past the shift still adds up exactly', () => {
    const { sanity } = sanityFor(
      intervals({ runtimes: [runtime('2026-06-23T00:00:00Z', '2026-06-23T13:54:05Z')] }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T03:30:00Z',
    )
    expect(sanity.checked.map((hour) => hour.specifiedKindsMs)).toEqual([60 * MIN, 60 * MIN])
    expect(sanity.withinTolerance).toEqual([0, 1])
  })

  it('flags missing coverage and overlapping segments instead of hiding them', () => {
    const gap = sanityFor(
      intervals({ runtimes: [runtime('2026-06-23T01:30:00Z', '2026-06-23T02:00:00Z')] }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T02:30:00Z',
    )
    expect(gap.sanity.uncovered).toEqual([0])
    expect(gap.sanity.checked[0]!.uncoveredMs).toBe(30 * MIN)

    const overlap = sanityFor(
      intervals({
        runtimes: [runtime('2026-06-23T01:30:00Z', '2026-06-23T02:30:00Z')],
        downtimes: [downtime('2026-06-23T02:00:00Z', '2026-06-23T02:30:00Z')],
      }),
      '2026-06-23T01:30:00Z',
      '2026-06-23T02:30:00Z',
    )
    expect(overlap.sanity.overlapping).toEqual([0])
    expect(overlap.sanity.checked[0]!.uncoveredMs).toBe(-30 * MIN)
  })

  it('checks 30-minute edge columns of a :30 shift against 30 minutes (client fixture)', () => {
    const { summary, sanity } = sanityFor(
      normalizeMachineIntervals(fixture.data),
      '2026-06-23T07:00:00Z',
      '2026-06-23T19:00:00Z',
    )
    expect(summary.columns[0]!.endMs - summary.columns[0]!.startMs).toBe(30 * MIN)
    expect(sanity.checked[0]).toMatchObject({ expectedMs: 30 * MIN, specifiedKindsMs: 30 * MIN })
    expect(sanity.withinTolerance).toEqual([0, 1, 2])
    expect(sanity.uncovered).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
})
