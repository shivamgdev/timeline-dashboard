import { useMemo } from 'react'
import { useAsyncResource } from '../../../hooks/useAsyncResource'
import { assetsApi } from '../api/assets.api'
import { shiftsApi } from '../api/shifts.api'
import { flattenSelectableAssets } from '../utils/assets'
import { buildShiftCatalog, type ShiftCatalog } from '../utils/shifts'
import type { AssetOption } from '../types'

const NO_ASSETS: AssetOption[] = []
const EMPTY_SHIFT_CATALOG: ShiftCatalog = { slots: [], errors: [] }

export function useReferenceData() {
  const assets = useAsyncResource(assetsApi.getTree)
  const shifts = useAsyncResource(shiftsApi.getAll)

  const assetOptions = useMemo(
    () => (assets.state.status === 'success' ? flattenSelectableAssets(assets.state.data) : NO_ASSETS),
    [assets.state],
  )

  const shiftCatalog = useMemo(
    () => (shifts.state.status === 'success' ? buildShiftCatalog(shifts.state.data) : EMPTY_SHIFT_CATALOG),
    [shifts.state],
  )

  return { assets, shifts, assetOptions, shiftCatalog }
}
