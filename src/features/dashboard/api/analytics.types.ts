export interface EntityScope {
  type: 'asset'
  asset: { asset_id: string; asset_level_id: number }
}

export interface TimeRange {
  from_ts: string
  to_ts: string
}

export interface MachineIntervalsRequest {
  entity_scope: EntityScope
  time_range: TimeRange
  produce_counts: true
  exact_produces: boolean
  group_produce_counts_by_part_model: true
}

export type CycleTimeMetric = 'ideal_cycle_time_seconds' | 'actual_cycle_time_seconds'

export interface CycleTimeRequest {
  entity_scope: EntityScope
  metrics: CycleTimeMetric[]
  time_range: TimeRange
  distribution: 'hourly'
}

export interface RuntimeSegment {
  start_at: string
  end_at: string
  type: string
  runtime_name: string | null
}

export interface DowntimeSegment {
  start_at: string
  end_at: string
  type: string
  downtime_name: string | null
}

export interface StoppageSegment {
  start_at: string
  end_at: string
  [field: string]: unknown
}

export interface ProduceCount {
  bucket_start: string
  part_model_id: string
  ok_count: number
  ng_count: number
}

export interface Produce {
  produce_id: string
  first_seen_ts: string
  result: string
  produce_type: string
  part_model_id: string
}

export interface ProduceBucket {
  bucket_start: string
  part_model_id: string
  produces: Produce[]
}

export interface MachineIntervalsResponse {
  machine_ids: number[] | null
  runtimes: RuntimeSegment[] | null
  downtimes: DowntimeSegment[] | null
  stoppages: StoppageSegment[] | null
  produce_counts: ProduceCount[] | null
  produces?: ProduceBucket[] | null
  metrics?: unknown
}

export interface MachineIntervals {
  machine_ids: number[]
  runtimes: RuntimeSegment[]
  downtimes: DowntimeSegment[]
  stoppages: StoppageSegment[]
  produce_counts: ProduceCount[]
  produces: ProduceBucket[] | null
  metrics: unknown
}

export interface CycleTimeBucket {
  entity_type: string
  entity_id: string
  asset_level_id: number
  bucket_start: string
  ideal_cycle_time_seconds: number | null
  actual_cycle_time_seconds: number | null
  [field: string]: unknown
}
