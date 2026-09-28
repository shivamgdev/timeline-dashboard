import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams, CustomSeriesRenderItemReturn } from 'echarts'
import type { CustomSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type {
  BrushComponentOption,
  DataZoomComponentOption,
  GridComponentOption,
  ToolboxComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import type { TimelineChartModel } from '../../features/dashboard/timeline/chartModel'
import { HOURLY_BUCKET_MS } from '../../features/dashboard/timeline/chartModel'
import type { TimelineSegment } from '../../features/dashboard/timeline/types'
import type { TimelinePalette } from '../../theme/theme'
import { formatInAppTimeZone } from '../../utils/timezone'
import { echarts } from './echarts'
import { SEGMENT_KIND_LABELS, segmentColor } from './segmentStyles'

export type TimelineOption = ComposeOption<
  | CustomSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | BrushComponentOption
  | ToolboxComponentOption
>

export const MIN_ZOOM_SPAN_MS = 60 * 1000
export const TIMELINE_ZOOM_ID = 'timeline-zoom'

const SERIES_IDS = {
  segments: 'segments',
  pass: 'pass',
  fail: 'fail',
  hourlyOk: 'hourly-ok',
  hourlyNg: 'hourly-ng',
} as const

const FAIL_SYMBOL = 'path://M1,0 L5,4 L9,0 L10,1 L6,5 L10,9 L9,10 L5,6 L1,10 L0,9 L4,5 L0,1 Z'
const LARGE_THRESHOLD = 2000

function formatAxisTime(value: number): string {
  const label = formatInAppTimeZone(value, value % MIN_ZOOM_SPAN_MS === 0 ? 'HH:mm' : 'HH:mm:ss')
  return label === '00:00' ? formatInAppTimeZone(value, 'dd MMM') : label
}

function formatInstant(value: number): string {
  return `${formatInAppTimeZone(value, 'dd MMM yyyy, HH:mm:ss')} IST`
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ')
}

function describeSegment(segment: TimelineSegment): string {
  const encode = echarts.format.encodeHTML
  const lines = [
    `<strong>${encode(SEGMENT_KIND_LABELS[segment.kind])}</strong>${segment.name ? ` · ${encode(segment.name)}` : ''}`,
    `${formatInAppTimeZone(segment.startMs, 'HH:mm:ss')} – ${formatInAppTimeZone(segment.endMs, 'HH:mm:ss')} IST`,
    `Duration: ${formatDuration(segment.endMs - segment.startMs)}`,
  ]
  if (segment.kind === 'unclassified' && segment.type) lines.push(`Backend type: ${encode(segment.type)}`)
  if (segment.clipped) lines.push('Clipped to the selected shift')
  return lines.join('<br/>')
}

interface TooltipParams {
  seriesId?: string
  dataIndex: number
  value?: unknown
}

function isTooltipParams(value: unknown): value is TooltipParams {
  return typeof value === 'object' && value !== null && 'dataIndex' in value && typeof value.dataIndex === 'number'
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function toRect(value: unknown): Rect | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, width, height } = value as Partial<Record<keyof Rect, unknown>>
  return typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number'
    ? { x, y, width, height }
    : null
}

function numberAt(value: unknown, index: number): number {
  return Array.isArray(value) && typeof value[index] === 'number' ? value[index] : Number.NaN
}

export function buildTimelineOption(model: TimelineChartModel, palette: TimelinePalette): TimelineOption {
  const { segments, markers, windowStartMs, windowEndMs } = model
  const segmentColors = segments.map((segment) => segmentColor(segment.kind, palette))

  const renderSegment = (
    params: CustomSeriesRenderItemParams,
    api: CustomSeriesRenderItemAPI,
  ): CustomSeriesRenderItemReturn => {
    const start = api.coord([api.value(0), 0])
    const end = api.coord([api.value(1), 0])
    const grid = toRect(params.coordSys)
    if (!grid) return null
    const shape = echarts.graphic.clipRectByRect(
      { x: start[0]!, y: grid.y, width: end[0]! - start[0]!, height: grid.height },
      grid,
    )
    if (!shape) return null
    return { type: 'rect', shape, style: { fill: segmentColors[params.dataIndex] }, silent: false }
  }

  const tooltipFormatter = (params: unknown): string => {
    if (!isTooltipParams(params)) return ''
    const { seriesId, dataIndex, value } = params
    if (seriesId === SERIES_IDS.segments) {
      const segment = segments[dataIndex]
      return segment ? describeSegment(segment) : ''
    }
    if (seriesId === SERIES_IDS.pass || seriesId === SERIES_IDS.fail) {
      const result = seriesId === SERIES_IDS.pass ? 'PASS' : 'FAIL'
      return `<strong>${result}</strong><br/>${formatInstant(numberAt(value, 0))}`
    }
    if (seriesId === SERIES_IDS.hourlyOk || seriesId === SERIES_IDS.hourlyNg) {
      const bucketStartMs = numberAt(value, 2)
      return [
        `<strong>Hourly bucket</strong> ${formatInAppTimeZone(bucketStartMs, 'HH:mm')}–${formatInAppTimeZone(bucketStartMs + HOURLY_BUCKET_MS, 'HH:mm')} IST`,
        `PASS (OK): ${numberAt(value, 3)}`,
        `FAIL (NG): ${numberAt(value, 4)}`,
        `Cumulative: ${numberAt(value, 1)}`,
      ].join('<br/>')
    }
    return ''
  }

  const markerSeries: ScatterSeriesOption[] =
    markers.mode === 'individual'
      ? [
          {
            id: SERIES_IDS.pass,
            type: 'scatter',
            name: 'PASS',
            data: markers.passPoints,
            dimensions: ['time', 'cumulative'],
            large: true,
            largeThreshold: LARGE_THRESHOLD,
            symbolSize: 5,
            itemStyle: { color: palette.pass },
            z: 3,
          },
          {
            id: SERIES_IDS.fail,
            type: 'scatter',
            name: 'FAIL',
            data: markers.failPoints,
            dimensions: ['time', 'cumulative'],
            large: true,
            largeThreshold: LARGE_THRESHOLD,
            symbol: FAIL_SYMBOL,
            symbolSize: 10,
            itemStyle: { color: palette.fail },
            z: 4,
          },
        ]
      : [
          {
            id: SERIES_IDS.hourlyOk,
            type: 'scatter',
            name: 'PASS',
            data: markers.hourly.map((point) => [
              point.x,
              point.cumulative,
              point.bucketStartMs,
              point.okCount,
              point.ngCount,
            ]),
            symbolSize: 9,
            itemStyle: { color: palette.pass, borderColor: '#fff', borderWidth: 1.5 },
            z: 3,
          },
          {
            id: SERIES_IDS.hourlyNg,
            type: 'scatter',
            name: 'FAIL',
            data: markers.hourly
              .filter((point) => point.ngCount > 0)
              .map((point) => [point.x, point.cumulative, point.bucketStartMs, point.okCount, point.ngCount]),
            symbol: FAIL_SYMBOL,
            symbolSize: 12,
            itemStyle: { color: palette.fail },
            z: 4,
          },
        ]

  return {
    animation: false,
    useUTC: true,
    grid: { left: 56, right: 24, top: 28, bottom: 36 },
    xAxis: {
      type: 'time',
      min: windowStartMs,
      max: windowEndMs,
      axisLabel: { formatter: formatAxisTime, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Cumulative production',
      nameTextStyle: { align: 'left' },
      min: 0,
      max: Math.max(model.yMax, 1),
      minInterval: 1,
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.35)' } },
    },
    tooltip: { trigger: 'item', confine: true, formatter: tooltipFormatter },
    dataZoom: [
      {
        id: TIMELINE_ZOOM_ID,
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: false,
        moveOnMouseMove: false,
        moveOnMouseWheel: false,
        minValueSpan: MIN_ZOOM_SPAN_MS,
      },
    ],
    toolbox: { show: false },
    brush: {
      xAxisIndex: 0,
      seriesIndex: [],
      brushType: 'lineX',
      brushMode: 'single',
      transformable: false,
      removeOnClick: true,
      throttleType: 'debounce',
      brushStyle: { color: 'rgba(29, 78, 216, 0.15)', borderColor: 'rgba(29, 78, 216, 0.7)', borderWidth: 1 },
    },
    series: [
      {
        id: SERIES_IDS.segments,
        type: 'custom',
        name: 'Segments',
        renderItem: renderSegment,
        data: segments.map((segment) => [segment.startMs, segment.endMs]),
        encode: { x: [0, 1] },
        clip: true,
        z: 1,
      },
      ...markerSeries,
    ],
  }
}
