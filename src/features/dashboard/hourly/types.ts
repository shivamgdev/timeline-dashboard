import type { HourlyProduction, SegmentKind } from '../timeline/types'

export type ColumnState = 'complete' | 'in-progress' | 'future'

export type SegmentDurations = Record<SegmentKind, number>

export interface ProductionCell {
  okCount: number
  ngCount: number
  total: number
}

export interface CycleTimeCell {
  idealSeconds: number | null
  actualSeconds: number | null
}

export interface CycleTimeEntry extends CycleTimeCell {
  bucketStartMs: number
}

export interface HourlySummaryColumn {
  startMs: number
  endMs: number
  state: ColumnState
  elapsedMs: number | null
  durationsMs: SegmentDurations | null
  production: ProductionCell | null
  cycleTime: CycleTimeCell | null
}

export interface HourlySummary {
  columns: HourlySummaryColumn[]
  unassignedProduction: HourlyProduction[]
  unassignedCycleTimes: CycleTimeEntry[]
  columnsWithMultipleCycleTimes: number[]
  invalidCycleTimes: number
}
