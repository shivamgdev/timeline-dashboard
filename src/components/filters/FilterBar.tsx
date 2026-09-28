import RefreshIcon from '@mui/icons-material/Refresh'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import type { useDashboardFilters } from '../../features/dashboard/hooks/useDashboardFilters'
import type { useReferenceData } from '../../features/dashboard/hooks/useReferenceData'
import { isIsoDate } from '../../utils/timezone'
import AssetSelect from './AssetSelect'
import FilterField from './FilterField'
import ShiftSelect from './ShiftSelect'
import ShiftWindowSummary from './ShiftWindowSummary'

interface FilterBarProps {
  referenceData: ReturnType<typeof useReferenceData>
  filterState: ReturnType<typeof useDashboardFilters>
  canRefresh: boolean
  isRefreshing: boolean
  onRefresh: () => void
}

function RetryAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {message}
    </Alert>
  )
}

export default function FilterBar({ referenceData, filterState, canRefresh, isRefreshing, onRefresh }: FilterBarProps) {
  const { assets, shifts, assetOptions, shiftCatalog } = referenceData
  const { filters, shiftWindow, setAsset, setShift, setDate, setShowIndividualProduces } = filterState

  const assetPlaceholder = assets.state.status === 'loading' ? 'Loading assets…' : 'No assets available'
  const shiftPlaceholder = shifts.state.status === 'loading' ? 'Loading shifts…' : 'No shifts available'

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="flex-end">
            <FilterField id="asset-filter" label="Asset">
              <AssetSelect
                id="asset-filter"
                options={assetOptions}
                value={filters.asset}
                placeholder={assetPlaceholder}
                onChange={setAsset}
              />
            </FilterField>
            <FilterField id="date-filter" label="Date">
              <TextField
                id="date-filter"
                type="date"
                size="small"
                sx={{ width: 180 }}
                value={filters.date}
                onChange={(event) => {
                  if (isIsoDate(event.target.value)) setDate(event.target.value)
                }}
              />
            </FilterField>
            <FilterField id="shift-filter" label="Shift">
              <ShiftSelect
                id="shift-filter"
                slots={shiftCatalog.slots}
                value={filters.shift}
                placeholder={shiftPlaceholder}
                onChange={setShift}
              />
            </FilterField>
            <FormControlLabel
              sx={{ ml: 0 }}
              control={
                <Switch
                  checked={filters.showIndividualProduces}
                  onChange={(_, checked) => setShowIndividualProduces(checked)}
                />
              }
              label="Show individual produces"
            />
            <Box sx={{ ml: 'auto', alignSelf: 'center' }}>
              <Tooltip title="Refresh data">
                <span>
                  <IconButton aria-label="Refresh data" onClick={onRefresh} disabled={!canRefresh || isRefreshing}>
                    {isRefreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Stack>

          <ShiftWindowSummary asset={filters.asset} shiftWindow={shiftWindow} />

          {assets.state.status === 'error' && (
            <RetryAlert message={`Could not load assets. ${assets.state.error}`} onRetry={assets.retry} />
          )}
          {assets.state.status === 'success' && assetOptions.length === 0 && (
            <Alert severity="warning">No lines or machines are available for this account.</Alert>
          )}
          {shifts.state.status === 'error' && (
            <RetryAlert message={`Could not load shifts. ${shifts.state.error}`} onRetry={shifts.retry} />
          )}
          {shiftCatalog.errors.length > 0 && (
            <Alert severity="warning">Some shift definitions were skipped: {shiftCatalog.errors.join(' ')}</Alert>
          )}
          {shifts.state.status === 'success' && shiftCatalog.slots.length === 0 && (
            <Alert severity="warning">No active shifts are configured.</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
