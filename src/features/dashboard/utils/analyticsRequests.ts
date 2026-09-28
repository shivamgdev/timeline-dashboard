import type {
  CycleTimeMetric,
  CycleTimeRequest,
  EntityScope,
  MachineIntervalsRequest,
  TimeRange,
} from '../api/analytics.types'
import type { AssetOption, ShiftWindow } from '../types'

export const CYCLE_TIME_METRICS: readonly CycleTimeMetric[] = ['ideal_cycle_time_seconds', 'actual_cycle_time_seconds']

export interface AnalyticsScope {
  entity_scope: EntityScope
  time_range: TimeRange
}

export function buildAnalyticsScope(
  asset: Pick<AssetOption, 'assetId' | 'assetLevelId'>,
  shiftWindow: Pick<ShiftWindow, 'fromTs' | 'toTs'>,
): AnalyticsScope {
  return {
    entity_scope: { type: 'asset', asset: { asset_id: asset.assetId, asset_level_id: asset.assetLevelId } },
    time_range: { from_ts: shiftWindow.fromTs, to_ts: shiftWindow.toTs },
  }
}

export function buildMachineIntervalsRequest(scope: AnalyticsScope, exactProduces: boolean): MachineIntervalsRequest {
  return {
    entity_scope: scope.entity_scope,
    time_range: scope.time_range,
    produce_counts: true,
    exact_produces: exactProduces,
    group_produce_counts_by_part_model: true,
  }
}

export function buildCycleTimeRequest(scope: AnalyticsScope): CycleTimeRequest {
  return {
    entity_scope: scope.entity_scope,
    metrics: [...CYCLE_TIME_METRICS],
    time_range: scope.time_range,
    distribution: 'hourly',
  }
}
