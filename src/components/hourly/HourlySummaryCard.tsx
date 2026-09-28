import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import type { CycleTimeBucket, MachineIntervals } from '../../features/dashboard/api/analytics.types'
import { buildHourlyTableModel, isHourlySummaryEmpty } from '../../features/dashboard/hourly/tableModel'
import type { HourlySummary } from '../../features/dashboard/hourly/types'
import type { AsyncResource } from '../../hooks/useAsyncResource'

interface HourlySummaryCardProps {
  machineIntervals: AsyncResource<MachineIntervals>
  cycleTimes: AsyncResource<CycleTimeBucket[]>
  summary: HourlySummary | null
}

const stickyCell = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  bgcolor: 'background.paper',
  whiteSpace: 'nowrap',
} as const

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

export default function HourlySummaryCard({ machineIntervals, cycleTimes, summary }: HourlySummaryCardProps) {
  const model = useMemo(() => (summary ? buildHourlyTableModel(summary) : null), [summary])
  const intervalsState = machineIntervals.state
  if (intervalsState.status === 'idle') return null

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
            <Typography variant="subtitle1" component="h2" fontWeight={600}>
              Hourly Production &amp; Downtime Summary
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hours in IST
            </Typography>
          </Stack>

          {intervalsState.status === 'loading' && (
            <Stack direction="row" spacing={1.5} alignItems="center" role="status">
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Loading hourly summary…
              </Typography>
            </Stack>
          )}

          {intervalsState.status === 'error' && (
            <RetryAlert
              message={`Could not load the hourly summary. ${intervalsState.error}`}
              onRetry={machineIntervals.retry}
            />
          )}

          {cycleTimes.state.status === 'error' && (
            <RetryAlert
              message={`Could not load cycle times; those cells are left blank. ${cycleTimes.state.error}`}
              onRetry={cycleTimes.retry}
            />
          )}
          {cycleTimes.state.status === 'loading' && model && (
            <Typography variant="body2" color="text.secondary" role="status">
              Loading cycle times…
            </Typography>
          )}

          {summary && model && isHourlySummaryEmpty(summary) && cycleTimes.state.status !== 'loading' && (
            <Alert severity="info">No hourly data is available for the selected asset and shift.</Alert>
          )}

          {summary && model && !isHourlySummaryEmpty(summary) && (
            <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small" aria-label="Hourly production and downtime summary">
                <TableHead>
                  <TableRow>
                    <TableCell sx={stickyCell}>Param</TableCell>
                    {model.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        align="right"
                        sx={{ whiteSpace: 'nowrap', color: 'primary.main' }}
                        data-state={column.state}
                      >
                        {column.label}
                        {column.state === 'in-progress' && (
                          <Box component="span" sx={{ display: 'block', fontSize: 11, color: 'text.secondary' }}>
                            in progress
                          </Box>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {model.rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell component="th" scope="row" sx={stickyCell}>
                        {row.label}
                        {row.unit && (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            ({row.unit})
                          </Typography>
                        )}
                      </TableCell>
                      {row.cells.map((cell, index) => (
                        <TableCell key={model.columns[index]!.key} align="right">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {model?.notices.map((notice) => (
            <Alert key={notice} severity="info">
              {notice}
            </Alert>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}
