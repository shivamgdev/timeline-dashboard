import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import type { MachineIntervals } from '../../features/dashboard/api/analytics.types'
import { buildTimelineChartModel, type TimelineChartModel } from '../../features/dashboard/timeline/chartModel'
import type { TimelineData } from '../../features/dashboard/timeline/types'
import type { AsyncResource, AsyncResourceState } from '../../hooks/useAsyncResource'
import TimelineChart from './TimelineChart'
import TimelineLegend from './TimelineLegend'

interface TimelineCardProps {
  state: AsyncResourceState<MachineIntervals>
  individualProduces: AsyncResource<MachineIntervals>
  timeline: TimelineData | null
  onRetry: () => void
}

const CHART_HEIGHT = 360

function formatCount(value: number): string {
  return value.toLocaleString('en-IN')
}

function describeMarkers(model: TimelineChartModel): string {
  const { markers } = model
  if (markers.mode === 'hourly') {
    const ok = markers.hourly.reduce((sum, point) => sum + point.okCount, 0)
    const ng = markers.hourly.reduce((sum, point) => sum + point.ngCount, 0)
    return `Hourly produce counts · ${formatCount(ok)} PASS (OK) · ${formatCount(ng)} FAIL (NG)`
  }
  return `Individual produces · ${formatCount(markers.passCount)} PASS · ${formatCount(markers.failCount)} FAIL`
}

function unplottedNotice(model: TimelineChartModel): string | null {
  const { markers } = model
  if (markers.mode !== 'individual' || markers.unclassifiedCount === 0) return null
  const breakdown = Object.entries(markers.unclassifiedResults)
    .map(([result, count]) => `${formatCount(count)} ${result}`)
    .join(', ')
  return `${breakdown} produce ${markers.unclassifiedCount === 1 ? 'record is' : 'records are'} not plotted: only PASS and FAIL results have a defined marker.`
}

function diagnosticsNotice(timeline: TimelineData): string | null {
  const { invalidSegments, zeroLengthSegments, invalidProduces, invalidProduceCounts } = timeline.diagnostics
  const skipped = invalidSegments + zeroLengthSegments + invalidProduces + invalidProduceCounts
  return skipped > 0
    ? `${formatCount(skipped)} record(s) with missing or invalid timestamps or counts were skipped.`
    : null
}

function isEmpty(model: TimelineChartModel): boolean {
  const { markers } = model
  const markerCount =
    markers.mode === 'individual'
      ? markers.passCount + markers.failCount + markers.unclassifiedCount
      : markers.hourly.length
  return model.segments.length === 0 && markerCount === 0
}

export default function TimelineCard({ state, individualProduces, timeline, onRetry }: TimelineCardProps) {
  const model = useMemo(() => (timeline ? buildTimelineChartModel(timeline) : null), [timeline])
  const kinds = useMemo(() => new Set(model?.segments.map((segment) => segment.kind)), [model])

  if (state.status === 'idle') return null

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
            <Typography variant="subtitle1" component="h2" fontWeight={600}>
              Production history
            </Typography>
            <TimelineLegend kinds={kinds} />
          </Stack>

          {state.status === 'loading' && (
            <Box sx={{ height: CHART_HEIGHT, display: 'grid', placeItems: 'center' }} role="status">
              <Stack alignItems="center" spacing={1}>
                <CircularProgress size={28} />
                <Typography variant="body2" color="text.secondary">
                  Loading timeline…
                </Typography>
              </Stack>
            </Box>
          )}

          {state.status === 'error' && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={onRetry}>
                  Retry
                </Button>
              }
            >
              Could not load the timeline. {state.error}
            </Alert>
          )}

          {state.status === 'success' && individualProduces.state.status === 'loading' && (
            <Stack direction="row" spacing={1} alignItems="center" role="status">
              <CircularProgress size={14} />
              <Typography variant="body2" color="text.secondary">
                Loading individual produces…
              </Typography>
            </Stack>
          )}

          {state.status === 'success' && individualProduces.state.status === 'error' && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={individualProduces.retry}>
                  Retry
                </Button>
              }
            >
              Could not load individual produces. {individualProduces.state.error}
            </Alert>
          )}

          {state.status === 'success' && model && timeline && (
            <>
              {isEmpty(model) ? (
                <Alert severity="info">No timeline data is available for the selected asset and shift.</Alert>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    {describeMarkers(model)}
                  </Typography>
                  <TimelineChart model={model} height={CHART_HEIGHT} />
                </>
              )}
              {unplottedNotice(model) && <Alert severity="info">{unplottedNotice(model)}</Alert>}
              {diagnosticsNotice(timeline) && <Alert severity="warning">{diagnosticsNotice(timeline)}</Alert>}
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
