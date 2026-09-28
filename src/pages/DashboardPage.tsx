import Stack from '@mui/material/Stack'
import FilterBar from '../components/filters/FilterBar'
import HourlySummaryCard from '../components/hourly/HourlySummaryCard'
import TimelineCard from '../components/timeline/TimelineCard'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'
import { useDashboardFilters } from '../features/dashboard/hooks/useDashboardFilters'
import { useHourlySummary } from '../features/dashboard/hooks/useHourlySummary'
import { useReferenceData } from '../features/dashboard/hooks/useReferenceData'
import { useTimelineData } from '../features/dashboard/hooks/useTimelineData'

export default function DashboardPage() {
  const referenceData = useReferenceData()
  const filterState = useDashboardFilters(referenceData.assetOptions, referenceData.shiftCatalog.slots)
  const dashboardData = useDashboardData(filterState.filters, filterState.shiftWindow)
  const timeline = useTimelineData(
    dashboardData.machineIntervals.state,
    dashboardData.individualProduces.state,
    filterState.shiftWindow,
  )
  const hourlySummary = useHourlySummary(
    timeline.summary,
    dashboardData.cycleTimes.state,
    dashboardData.machineIntervals.settledAtMs,
  )

  return (
    <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>
      <FilterBar
        referenceData={referenceData}
        filterState={filterState}
        canRefresh={dashboardData.canRefresh}
        isRefreshing={dashboardData.isLoading}
        onRefresh={dashboardData.refresh}
      />
      <TimelineCard
        state={dashboardData.machineIntervals.state}
        individualProduces={dashboardData.individualProduces}
        timeline={timeline.chart}
        onRetry={dashboardData.retryTimeline}
      />
      <HourlySummaryCard
        machineIntervals={dashboardData.machineIntervals}
        cycleTimes={dashboardData.cycleTimes}
        summary={hourlySummary}
      />
    </Stack>
  )
}
