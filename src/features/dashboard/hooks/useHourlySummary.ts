import { useMemo } from 'react'
import type { AsyncResourceState } from '../../../hooks/useAsyncResource'
import type { CycleTimeBucket } from '../api/analytics.types'
import { buildClockHourBoundaries } from '../hourly/columns'
import { buildHourlySummary } from '../hourly/hourlySummary'
import type { HourlySummary } from '../hourly/types'
import type { TimelineData } from '../timeline/types'

const NO_CYCLE_TIMES: CycleTimeBucket[] = []

export function useHourlySummary(
  timeline: TimelineData | null,
  cycleTimesState: AsyncResourceState<CycleTimeBucket[]>,
  nowMs: number | null,
): HourlySummary | null {
  const cycleTimes = cycleTimesState.status === 'success' ? cycleTimesState.data : NO_CYCLE_TIMES
  return useMemo(() => {
    if (!timeline || nowMs === null) return null
    return buildHourlySummary({
      timeline,
      cycleTimes,
      boundaries: buildClockHourBoundaries(timeline.windowStartMs, timeline.windowEndMs),
      nowMs,
    })
  }, [timeline, cycleTimes, nowMs])
}
