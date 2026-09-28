import type { IsoDate } from '../../utils/timezone'

export interface AssetNode {
  id: string
  name: string
  codename?: string | null
  assetlevel_id: number
  hierarchy?: string | null
  children: AssetNode[]
}

export interface ShiftDefinition {
  id: string
  code: string
  name: string
  shift_timings: string[]
  is_active: boolean
}

export interface AssetOption {
  assetId: string
  assetLevelId: number
  name: string
  codename: string | null
  groupLabel: string
  depth: number
}

export interface ShiftSlot {
  key: string
  shiftId: string
  shiftCode: string
  shiftName: string
  startTime: string
  endTime: string
  startMinutes: number
  endMinutes: number
  crossesMidnight: boolean
  label: string
}

export interface ShiftWindow {
  date: IsoDate
  startLocal: string
  endLocal: string
  fromTs: string
  toTs: string
  startMs: number
  endMs: number
}

export interface DashboardFilters {
  asset: AssetOption | null
  shift: ShiftSlot | null
  date: IsoDate
  showIndividualProduces: boolean
}
