import { describe, expect, it } from 'vitest'
import type { TimelineChartModel } from '../../features/dashboard/timeline/chartModel'
import type { TimelineSegment } from '../../features/dashboard/timeline/types'
import { theme } from '../../theme/theme'
import { buildTimelineOption, MIN_ZOOM_SPAN_MS } from './timelineOption'

const ms = (iso: string) => Date.parse(iso)
const windowStartMs = ms('2026-06-23T01:30:00Z')
const windowEndMs = ms('2026-06-23T13:30:00Z')

function segment(overrides: Partial<TimelineSegment>): TimelineSegment {
  return {
    kind: 'runtime',
    source: 'runtimes',
    type: 'planned',
    name: null,
    startMs: windowStartMs,
    endMs: windowStartMs + 3_600_000,
    sourceStartMs: windowStartMs,
    sourceEndMs: windowStartMs + 3_600_000,
    clipped: false,
    ...overrides,
  }
}

const individualModel: TimelineChartModel = {
  windowStartMs,
  windowEndMs,
  segments: [
    segment({}),
    segment({
      kind: 'planned-downtime',
      source: 'downtimes',
      type: 'planned',
      name: '<img src=x onerror=alert(1)>',
      startMs: windowStartMs + 3_600_000,
      endMs: windowEndMs,
      sourceEndMs: windowEndMs + 1_445_000,
      clipped: true,
    }),
  ],
  markers: {
    mode: 'individual',
    passPoints: new Float64Array([windowStartMs + 1000, 1, windowStartMs + 3000, 3]),
    failPoints: new Float64Array([windowStartMs + 2000, 2]),
    passCount: 2,
    failCount: 1,
    unclassifiedResults: { WIP: 4 },
    unclassifiedCount: 4,
  },
  yMax: 3,
}

type AnyRecord = Record<string, unknown>
const seriesById = (option: AnyRecord, id: string) =>
  (option.series as AnyRecord[]).find((series) => series.id === id) as AnyRecord
const tooltipFormatter = (option: AnyRecord) => (option.tooltip as { formatter: (params: unknown) => string }).formatter

describe('buildTimelineOption', () => {
  const option = buildTimelineOption(individualModel, theme.palette.timeline) as unknown as AnyRecord

  it('renders produce markers as large canvas scatter series fed by typed arrays', () => {
    const pass = seriesById(option, 'pass')
    const fail = seriesById(option, 'fail')
    expect(pass).toMatchObject({ type: 'scatter', large: true, itemStyle: { color: theme.palette.timeline.pass } })
    expect(pass.data).toBe(individualModel.markers.mode === 'individual' && individualModel.markers.passPoints)
    expect(fail).toMatchObject({ type: 'scatter', itemStyle: { color: theme.palette.timeline.fail } })
    expect(fail.data).toBe(individualModel.markers.mode === 'individual' && individualModel.markers.failPoints)
    expect((fail.z as number) > (pass.z as number)).toBe(true)
  })

  it('draws one band per clipped segment and bounds the axis to the shift window', () => {
    expect(seriesById(option, 'segments').data).toEqual(individualModel.segments.map((s) => [s.startMs, s.endMs]))
    expect(option.xAxis).toMatchObject({ type: 'time', min: windowStartMs, max: windowEndMs })
    expect(option.useUTC).toBe(true)
  })

  it('zooms by brushing with a 60 s minimum span and no wheel/drag panning', () => {
    expect(option.dataZoom).toEqual([
      expect.objectContaining({
        type: 'inside',
        filterMode: 'none',
        zoomOnMouseWheel: false,
        moveOnMouseMove: false,
        minValueSpan: MIN_ZOOM_SPAN_MS,
      }),
    ])
    expect(option.brush).toMatchObject({ brushType: 'lineX', xAxisIndex: 0, seriesIndex: [] })
  })

  it('formats axis labels in IST regardless of the host timezone', () => {
    const formatter = (option.xAxis as { axisLabel: { formatter: (value: number) => string } }).axisLabel.formatter
    expect(formatter(ms('2026-06-23T01:30:00Z'))).toBe('07:00')
    expect(formatter(ms('2026-06-23T01:30:30Z'))).toBe('07:00:30')
    expect(formatter(ms('2026-06-23T18:30:00Z'))).toBe('24 Jun')
  })

  it('shows marker time and result in IST in the tooltip', () => {
    const format = tooltipFormatter(option)
    expect(format({ seriesId: 'fail', dataIndex: 0, value: [windowStartMs + 2000, 2] })).toBe(
      '<strong>FAIL</strong><br/>23 Jun 2026, 07:00:02 IST',
    )
    expect(format({ seriesId: 'pass', dataIndex: 0, value: [windowStartMs + 1000, 1] })).toContain('PASS')
  })

  it('escapes backend-provided names in segment tooltips and flags clipped segments', () => {
    const text = tooltipFormatter(option)({ seriesId: 'segments', dataIndex: 1 })
    expect(text).not.toContain('<img')
    expect(text).toContain('&lt;img')
    expect(text).toContain('Planned downtime')
    expect(text).toContain('Clipped to the selected shift')
    expect(text).toContain('08:00:00 – 19:00:00 IST')
  })

  it('renders hourly buckets with a FAIL overlay only where NG > 0', () => {
    const hourlyOption = buildTimelineOption(
      {
        ...individualModel,
        markers: {
          mode: 'hourly',
          hourly: [
            {
              x: ms('2026-06-23T03:00:00Z'),
              cumulative: 37,
              bucketStartMs: ms('2026-06-23T02:00:00Z'),
              okCount: 37,
              ngCount: 0,
            },
            {
              x: ms('2026-06-23T04:00:00Z'),
              cumulative: 92,
              bucketStartMs: ms('2026-06-23T03:00:00Z'),
              okCount: 52,
              ngCount: 3,
            },
          ],
          bucketsOutsideWindow: 0,
        },
      },
      theme.palette.timeline,
    ) as unknown as AnyRecord
    expect((seriesById(hourlyOption, 'hourly-ok').data as unknown[]).length).toBe(2)
    expect(seriesById(hourlyOption, 'hourly-ng').data).toEqual([
      [ms('2026-06-23T04:00:00Z'), 92, ms('2026-06-23T03:00:00Z'), 52, 3],
    ])
    expect(
      tooltipFormatter(hourlyOption)({
        seriesId: 'hourly-ng',
        dataIndex: 0,
        value: [ms('2026-06-23T04:00:00Z'), 92, ms('2026-06-23T03:00:00Z'), 52, 3],
      }),
    ).toBe('<strong>Hourly bucket</strong> 08:30–09:30 IST<br/>PASS (OK): 52<br/>FAIL (NG): 3<br/>Cumulative: 92')
  })
})
