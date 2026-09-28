import { useCallback, useMemo } from 'react'
import { useAsyncResource, type ResourceLoader } from '../../../hooks/useAsyncResource'
import { analyticsApi } from '../api/analytics.api'
import type { CycleTimeBucket, MachineIntervals } from '../api/analytics.types'
import type { DashboardFilters, ShiftWindow } from '../types'
import { buildAnalyticsScope, buildCycleTimeRequest, buildMachineIntervalsRequest } from '../utils/analyticsRequests'

export function useDashboardData(filters: DashboardFilters, shiftWindow: ShiftWindow | null) {
  const assetId = filters.asset?.assetId
  const assetLevelId = filters.asset?.assetLevelId
  const fromTs = shiftWindow?.fromTs
  const toTs = shiftWindow?.toTs
  const { showIndividualProduces } = filters

  const scope = useMemo(
    () =>
      assetId !== undefined && assetLevelId !== undefined && fromTs !== undefined && toTs !== undefined
        ? buildAnalyticsScope({ assetId, assetLevelId }, { fromTs, toTs })
        : null,
    [assetId, assetLevelId, fromTs, toTs],
  )

  const loadMachineIntervals = useMemo((): ResourceLoader<MachineIntervals> | null => {
    if (!scope) return null
    const request = buildMachineIntervalsRequest(scope, false)
    return (signal) => analyticsApi.getMachineIntervals(request, signal)
  }, [scope])

  const loadIndividualProduces = useMemo((): ResourceLoader<MachineIntervals> | null => {
    if (!scope || !showIndividualProduces) return null
    const request = buildMachineIntervalsRequest(scope, true)
    return (signal) => analyticsApi.getMachineIntervals(request, signal)
  }, [scope, showIndividualProduces])

  const loadCycleTimes = useMemo((): ResourceLoader<CycleTimeBucket[]> | null => {
    if (!scope) return null
    const request = buildCycleTimeRequest(scope)
    return (signal) => analyticsApi.getCycleTimes(request, signal)
  }, [scope])

  const machineIntervals = useAsyncResource(loadMachineIntervals)
  const individualProduces = useAsyncResource(loadIndividualProduces)
  const cycleTimes = useAsyncResource(loadCycleTimes)

  const retryMachineIntervals = machineIntervals.retry
  const retryIndividualProduces = individualProduces.retry
  const retryCycleTimes = cycleTimes.retry
  const refresh = useCallback(() => {
    retryMachineIntervals()
    retryIndividualProduces()
    retryCycleTimes()
  }, [retryMachineIntervals, retryIndividualProduces, retryCycleTimes])

  const individualProducesFailed = individualProduces.state.status === 'error'
  const retryTimeline = useCallback(() => {
    retryMachineIntervals()
    if (individualProducesFailed) retryIndividualProduces()
  }, [retryMachineIntervals, retryIndividualProduces, individualProducesFailed])

  return {
    machineIntervals,
    individualProduces,
    cycleTimes,
    refresh,
    retryTimeline,
    canRefresh: scope !== null,
    isLoading: [machineIntervals, individualProduces, cycleTimes].some(({ state }) => state.status === 'loading'),
  }
}

export type DashboardData = ReturnType<typeof useDashboardData>
