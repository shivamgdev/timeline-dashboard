import { useMemo } from 'react'
import type { AsyncResourceState } from '../../../hooks/useAsyncResource'
import type { MachineIntervals } from '../api/analytics.types'
import { normalizeTimeline, withIndividualProduces } from '../timeline/normalizeTimeline'
import type { TimelineData } from '../timeline/types'
import type { ShiftWindow } from '../types'

export interface TimelineViews {
  summary: TimelineData | null
  chart: TimelineData | null
}

export function useTimelineData(
  state: AsyncResourceState<MachineIntervals>,
  individualProducesState: AsyncResourceState<MachineIntervals>,
  shiftWindow: ShiftWindow | null,
): TimelineViews {
  const summary = useMemo(
    () => (state.status === 'success' && shiftWindow ? normalizeTimeline(state.data, shiftWindow) : null),
    [state, shiftWindow],
  )
  const chart = useMemo(() => {
    if (!summary || individualProducesState.status !== 'success') return summary
    return withIndividualProduces(summary, individualProducesState.data.produces ?? [])
  }, [summary, individualProducesState])
  return { summary, chart }
}
