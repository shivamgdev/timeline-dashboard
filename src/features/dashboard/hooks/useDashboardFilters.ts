import { useCallback, useMemo, useState } from 'react'
import type { IsoDate } from '../../../utils/timezone'
import { DEFAULT_DASHBOARD_DATE } from '../constants'
import type { AssetOption, DashboardFilters, ShiftSlot } from '../types'
import { isSameAsset } from '../utils/assets'
import { buildShiftWindow } from '../utils/shifts'

const INITIAL_FILTERS: DashboardFilters = {
  asset: null,
  shift: null,
  date: DEFAULT_DASHBOARD_DATE,
  showIndividualProduces: false,
}

export function useDashboardFilters(assetOptions: readonly AssetOption[], shiftSlots: readonly ShiftSlot[]) {
  const [selection, setSelection] = useState<DashboardFilters>(INITIAL_FILTERS)

  const asset = useMemo(() => {
    const selected = selection.asset
    return (selected && assetOptions.find((option) => isSameAsset(option, selected))) ?? assetOptions[0] ?? null
  }, [assetOptions, selection.asset])

  const shift = useMemo(
    () => shiftSlots.find((slot) => slot.key === selection.shift?.key) ?? shiftSlots[0] ?? null,
    [shiftSlots, selection.shift],
  )

  const filters = useMemo<DashboardFilters>(() => ({ ...selection, asset, shift }), [selection, asset, shift])

  const shiftWindow = useMemo(() => (shift ? buildShiftWindow(selection.date, shift) : null), [shift, selection.date])

  const setAsset = useCallback((next: AssetOption) => setSelection((current) => ({ ...current, asset: next })), [])
  const setShift = useCallback((next: ShiftSlot) => setSelection((current) => ({ ...current, shift: next })), [])
  const setDate = useCallback((next: IsoDate) => setSelection((current) => ({ ...current, date: next })), [])
  const setShowIndividualProduces = useCallback(
    (next: boolean) => setSelection((current) => ({ ...current, showIndividualProduces: next })),
    [],
  )

  return { filters, shiftWindow, setAsset, setShift, setDate, setShowIndividualProduces }
}
