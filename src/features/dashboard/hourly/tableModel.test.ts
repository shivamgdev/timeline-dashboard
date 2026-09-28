import { describe, expect, it } from 'vitest'
import type { ApiEnvelope } from '../../../api/types'
import cycleTimeFixture from '../api/__fixtures__/sample-analytics-query-cycle-time.json'
import machineIntervalsFixture from '../api/__fixtures__/sample-machine-intervals.json'
import type { CycleTimeBucket, MachineIntervals, MachineIntervalsResponse } from '../api/analytics.types'
import { normalizeTimeline } from '../timeline/normalizeTimeline'
import { normalizeMachineIntervals } from '../utils/machineIntervals'
import { buildClockHourBoundaries } from './columns'
import { buildHourlySummary } from './hourlySummary'
import { buildHourlyTableModel, isHourlySummaryEmpty } from './tableModel'

const intervalsEnvelope: ApiEnvelope<MachineIntervalsResponse> = machineIntervalsFixture
const cycleEnvelope: ApiEnvelope<CycleTimeBucket[]> = cycleTimeFixture
const ms = (iso: string) => Date.parse(iso)
const AFTER_WINDOW = ms('2026-06-24T00:00:00Z')

const window = { startMs: ms('2026-06-23T07:00:00Z'), endMs: ms('2026-06-23T19:00:00Z') }
const timeline = normalizeTimeline(normalizeMachineIntervals(intervalsEnvelope.data), window)
const boundaries = buildClockHourBoundaries(window.startMs, window.endMs)

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

const rowCells = (model: ReturnType<typeof buildHourlyTableModel>, id: string) =>
  model.rows.find((row) => row.id === id)!.cells

describe('buildHourlyTableModel — client fixtures', () => {
  const model = buildHourlyTableModel(
    buildHourlySummary({ timeline, cycleTimes: cycleEnvelope.data, boundaries, nowMs: AFTER_WINDOW }),
  )

  it('uses exactly the rows specified in ASG 2.4, in order', () => {
    expect(model.rows.map((row) => [row.label, row.unit])).toEqual([
      ['Total', null],
      ['Pass', null],
      ['Fail', null],
      ['Runtime', 'min'],
      ['Unplanned Production', 'min'],
      ['Stoppage', 'min'],
      ['Unknown Downtime', 'min'],
      ['Ideal Cycle Time', 's'],
      ['Actual Cycle Time', 's'],
    ])
  })

  it('labels IST clock-hour columns, with partial edges for the sample 12:30–00:30 shift', () => {
    expect(model.columns.map((column) => column.label).slice(0, 3)).toEqual([
      '12:30 – 13:00',
      '13:00 – 14:00',
      '14:00 – 15:00',
    ])
    expect(model.columns.at(-1)?.label).toBe('00:00 – 00:30')
    expect(model.columns).toHaveLength(13)
    expect(model.columns.every((column) => column.state === 'complete')).toBe(true)
  })

  it('fills produce rows from ok_count/ng_count by the IST hour of bucket_start', () => {
    expect(rowCells(model, 'total').slice(0, 4)).toEqual(['37', '55', '88', '0'])
    expect(rowCells(model, 'pass').slice(0, 4)).toEqual(['37', '52', '87', '0'])
    expect(rowCells(model, 'fail').slice(0, 4)).toEqual(['0', '3', '1', '0'])
  })

  it('shows segment minutes per column with one decimal', () => {
    expect(rowCells(model, 'runtime').slice(0, 5)).toEqual(['19.3', '50', '50.1', '48.6', '0'])
    expect(rowCells(model, 'unplanned-production').slice(0, 3)).toEqual(['0', '4.8', '0'])
    expect(rowCells(model, 'unknown-downtime').slice(0, 3)).toEqual(['10.8', '5.2', '9.9'])
    expect(rowCells(model, 'stoppage').slice(0, 3)).toEqual(['0', '0', '0'])
  })

  it('shows cycle times in seconds and leaves null values and hours without a bucket blank', () => {
    expect(rowCells(model, 'ideal-cycle-time').slice(0, 4)).toEqual(['307', '307', '', ''])
    expect(rowCells(model, 'actual-cycle-time').slice(0, 4)).toEqual(['412.5', '389.2', '', ''])
  })

  it('flags that the small sample fixture does not cover the whole shift, without inventing minutes', () => {
    expect(model.notices).toEqual([
      '10 elapsed hour(s) have 521.4 min not covered by any segment, so they add up to less than the hour.',
    ])
    expect(model.sanity.withinTolerance).toEqual([0, 1, 2])
  })
})

describe('buildHourlyTableModel — synthetic cases (labelled; not from the client fixtures)', () => {
  it('leaves every cell of a future hour blank, not zero', () => {
    const summary = buildHourlySummary({
      timeline,
      cycleTimes: cycleEnvelope.data,
      boundaries,
      nowMs: ms('2026-06-23T08:15:00Z'),
    })
    const model = buildHourlyTableModel(summary)
    expect(model.columns.map((column) => column.state).slice(0, 4)).toEqual([
      'complete',
      'in-progress',
      'future',
      'future',
    ])
    for (const row of model.rows) {
      expect(row.cells.slice(2)).toEqual(Array(model.columns.length - 2).fill(''))
    }
    expect(rowCells(model, 'total')[1]).toBe('55')
  })

  it('discloses planned downtime and unclassified minutes that have no specified row', () => {
    const syntheticWindow = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T02:30:00Z') }
    const syntheticTimeline = normalizeTimeline(
      emptyIntervals({
        downtimes: [
          {
            start_at: '2026-06-23T01:30:00Z',
            end_at: '2026-06-23T01:50:00Z',
            type: 'planned',
            downtime_name: 'TEA BREAK',
          },
          { start_at: '2026-06-23T01:50:00Z', end_at: '2026-06-23T01:55:00Z', type: 'breakdown', downtime_name: null },
        ],
        runtimes: [
          { start_at: '2026-06-23T01:55:00Z', end_at: '2026-06-23T02:30:00Z', type: 'planned', runtime_name: null },
        ],
      }),
      syntheticWindow,
    )
    const model = buildHourlyTableModel(
      buildHourlySummary({
        timeline: syntheticTimeline,
        cycleTimes: [],
        boundaries: buildClockHourBoundaries(syntheticWindow.startMs, syntheticWindow.endMs),
        nowMs: AFTER_WINDOW,
      }),
    )
    expect(model.notices).toEqual([
      'Planned downtime (20 min in this shift) is not one of the rows specified for this table. 1 elapsed hour(s) therefore add up to less than 60 min in the sanity check (runtime + unplanned production + stoppage + unknown downtime).',
      'Segments with an unrecognised type (5 min) are not included in any row.',
    ])
    expect(rowCells(model, 'runtime')).toEqual(['35'])
  })

  it('reports buckets outside the columns, multiple cycle times per hour and invalid cycle rows', () => {
    const syntheticWindow = { startMs: ms('2026-06-23T01:30:00Z'), endMs: ms('2026-06-23T03:30:00Z') }
    const cycle = (bucket_start: string): CycleTimeBucket => ({
      entity_type: 'asset',
      entity_id: 'e',
      asset_level_id: 20,
      bucket_start,
      ideal_cycle_time_seconds: 37,
      actual_cycle_time_seconds: 29,
    })
    const model = buildHourlyTableModel(
      buildHourlySummary({
        timeline: normalizeTimeline(
          emptyIntervals({
            produce_counts: [{ bucket_start: '2026-06-22T20:00:00Z', part_model_id: 'pm', ok_count: 1, ng_count: 0 }],
          }),
          syntheticWindow,
        ),
        cycleTimes: [cycle('2026-06-23T02:30:00Z'), cycle('2026-06-23T02:45:00Z'), cycle('invalid')],
        boundaries: buildClockHourBoundaries(syntheticWindow.startMs, syntheticWindow.endMs),
        nowMs: AFTER_WINDOW,
      }),
    )
    expect(model.notices).toEqual([
      '2 elapsed hour(s) have 120 min not covered by any segment, so they add up to less than the hour.',
      "1 hourly bucket(s) fall outside the shift's columns and are not shown.",
      'Cycle time is left blank for 1 hour(s) that received more than one cycle-time bucket.',
      '1 cycle-time row(s) with an invalid timestamp were skipped.',
    ])
  })
})

describe('isHourlySummaryEmpty', () => {
  it('is true for an empty shift and false for the fixture', () => {
    const empty = buildHourlySummary({
      timeline: normalizeTimeline(emptyIntervals(), window),
      cycleTimes: [],
      boundaries,
      nowMs: AFTER_WINDOW,
    })
    expect(isHourlySummaryEmpty(empty)).toBe(true)
    expect(
      isHourlySummaryEmpty(buildHourlySummary({ timeline, cycleTimes: [], boundaries, nowMs: AFTER_WINDOW })),
    ).toBe(false)
  })
})
