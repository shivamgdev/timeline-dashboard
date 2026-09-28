import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimelineChartModel } from '../../features/dashboard/timeline/chartModel'
import { echarts } from './echarts'
import { buildTimelineOption, TIMELINE_ZOOM_ID, type TimelineOption } from './timelineOption'
import { clampZoomRange, readBrushRange } from './zoomRange'

interface TimelineChartProps {
  model: TimelineChartModel
  height?: number
}

type ChartInstance = ReturnType<typeof echarts.init>

function activateBrush(chart: ChartInstance) {
  chart.dispatchAction({
    type: 'takeGlobalCursor',
    key: 'brush',
    brushOption: { brushType: 'lineX', brushMode: 'single' },
  })
}

interface LatestView {
  option: TimelineOption
  windowStartMs: number
  windowEndMs: number
}

export default function TimelineChart({ model, height = 360 }: TimelineChartProps) {
  const palette = useTheme().palette.timeline
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const latestViewRef = useRef<LatestView | null>(null)
  const [zoomedOption, setZoomedOption] = useState<TimelineOption | null>(null)

  const option = useMemo(() => buildTimelineOption(model, palette), [model, palette])
  const isZoomed = zoomedOption === option

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = echarts.init(container, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const resetZoom = () => {
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: TIMELINE_ZOOM_ID, start: 0, end: 100 })
      setZoomedOption(null)
    }
    const handleBrushEnd = (event: unknown) => {
      const view = latestViewRef.current
      const range = readBrushRange(event)
      chart.dispatchAction({ type: 'brush', areas: [] })
      if (!view || !range) return
      const [startValue, endValue] = clampZoomRange(range, view.windowStartMs, view.windowEndMs)
      chart.dispatchAction({ type: 'dataZoom', dataZoomId: TIMELINE_ZOOM_ID, startValue, endValue })
      setZoomedOption(view.option)
    }

    chart.on('brushEnd', handleBrushEnd)
    chart.getZr().on('dblclick', resetZoom)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    latestViewRef.current = { option, windowStartMs: model.windowStartMs, windowEndMs: model.windowEndMs }
    chart.setOption(option, { notMerge: true })
    activateBrush(chart)
  }, [option, model.windowStartMs, model.windowEndMs])

  const resetZoom = () => {
    chartRef.current?.dispatchAction({ type: 'dataZoom', dataZoomId: TIMELINE_ZOOM_ID, start: 0, end: 100 })
    setZoomedOption(null)
  }

  return (
    <Stack spacing={1}>
      <div ref={containerRef} style={{ width: '100%', height }} role="img" aria-label="Production timeline" />
      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography variant="caption" color="text.secondary">
          Drag across the chart to zoom into a time range · double-click to reset
        </Typography>
        {isZoomed && (
          <Button size="small" variant="outlined" onClick={resetZoom}>
            Reset zoom
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
