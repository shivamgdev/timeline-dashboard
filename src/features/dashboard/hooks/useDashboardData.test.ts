// @vitest-environment happy-dom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../api/errors'
import { deferred, flush, renderHook } from '../../../test/renderHook'
import { analyticsApi } from '../api/analytics.api'
import type {
  CycleTimeBucket,
  CycleTimeRequest,
  MachineIntervals,
  MachineIntervalsRequest,
} from '../api/analytics.types'
import type { AssetOption, DashboardFilters, ShiftWindow } from '../types'
import { buildShiftSlots, buildShiftWindow } from '../utils/shifts'
import { useDashboardData } from './useDashboardData'

vi.mock('../api/analytics.api', () => ({
  analyticsApi: { getMachineIntervals: vi.fn(), getCycleTimes: vi.fn() },
}))

const getMachineIntervals = vi.mocked(analyticsApi.getMachineIntervals)
const getCycleTimes = vi.mocked(analyticsApi.getCycleTimes)

const line: AssetOption = {
  assetId: 'line-id',
  assetLevelId: 20,
  name: 'Line 1',
  codename: null,
  groupLabel: 'Shop',
  depth: 0,
}
const machine: AssetOption = {
  assetId: 'machine-id',
  assetLevelId: 10,
  name: 'AOI',
  codename: null,
  groupLabel: 'Shop',
  depth: 1,
}

const slots = (() => {
  const result = buildShiftSlots({
    id: 's',
    code: 'summer',
    name: 'summer',
    shift_timings: ['07:00', '19:00'],
    is_active: true,
  })
  if (!result.ok) throw new Error(result.error)
  return result.slots
})()

interface Props {
  filters: DashboardFilters
  shiftWindow: ShiftWindow | null
}

function props(overrides: Partial<DashboardFilters> = {}, date = '2026-06-23', slotIndex = 0): Props {
  const filters: DashboardFilters = {
    asset: line,
    shift: slots[slotIndex]!,
    date,
    showIndividualProduces: false,
    ...overrides,
  }
  return { filters, shiftWindow: filters.shift ? buildShiftWindow(date, filters.shift) : null }
}

function intervals(runtimeCount: number): MachineIntervals {
  return {
    machine_ids: [1],
    runtimes: Array.from({ length: runtimeCount }, (_, index) => ({
      start_at: `2026-06-23T0${index}:00:00Z`,
      end_at: `2026-06-23T0${index}:30:00Z`,
      type: 'planned',
      runtime_name: null,
    })),
    downtimes: [],
    stoppages: [],
    produce_counts: [],
    produces: null,
    metrics: null,
  }
}

const render = (initial: Props) =>
  renderHook(({ filters, shiftWindow }: Props) => useDashboardData(filters, shiftWindow), initial)

const intervalsRequests = () => getMachineIntervals.mock.calls.map(([request]) => request as MachineIntervalsRequest)
const cycleRequests = () => getCycleTimes.mock.calls.map(([request]) => request as CycleTimeRequest)

beforeEach(() => {
  getMachineIntervals.mockReset()
  getCycleTimes.mockReset()
})

describe('useDashboardData', () => {
  it('does not request anything until an asset and shift window are available', () => {
    const hook = render({
      filters: { asset: null, shift: null, date: '2026-06-23', showIndividualProduces: false },
      shiftWindow: null,
    })
    expect(getMachineIntervals).not.toHaveBeenCalled()
    expect(getCycleTimes).not.toHaveBeenCalled()
    expect(hook.result.machineIntervals.state).toEqual({ status: 'idle' })
    expect(hook.result.canRefresh).toBe(false)
  })

  it('loads both endpoints for the current filters and exposes the results', async () => {
    getMachineIntervals.mockResolvedValue(intervals(2))
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())

    expect(intervalsRequests()).toEqual([
      {
        entity_scope: { type: 'asset', asset: { asset_id: 'line-id', asset_level_id: 20 } },
        time_range: { from_ts: '2026-06-23T01:30:00Z', to_ts: '2026-06-23T13:30:00Z' },
        produce_counts: true,
        exact_produces: false,
        group_produce_counts_by_part_model: true,
      },
    ])
    expect(cycleRequests()).toEqual([
      {
        entity_scope: { type: 'asset', asset: { asset_id: 'line-id', asset_level_id: 20 } },
        metrics: ['ideal_cycle_time_seconds', 'actual_cycle_time_seconds'],
        time_range: { from_ts: '2026-06-23T01:30:00Z', to_ts: '2026-06-23T13:30:00Z' },
        distribution: 'hourly',
      },
    ])
    expect(hook.result.isLoading).toBe(true)
    await flush()
    expect(hook.result.machineIntervals.state).toEqual({ status: 'success', data: intervals(2) })
    expect(hook.result.cycleTimes.state).toEqual({ status: 'success', data: [] })
    expect(hook.result.isLoading).toBe(false)
  })

  it('refetches only machine intervals when the individual-produces toggle changes', async () => {
    getMachineIntervals.mockResolvedValue(intervals(1))
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())
    await flush()

    hook.rerender(props({ showIndividualProduces: true }))
    await flush()
    expect(intervalsRequests().map((request) => request.exact_produces)).toEqual([false, true])
    expect(getCycleTimes).toHaveBeenCalledTimes(1)
  })

  it('refetches both endpoints with the new window when the date or shift changes', async () => {
    getMachineIntervals.mockResolvedValue(intervals(1))
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())
    await flush()

    hook.rerender(props({}, '2026-06-24', 1))
    await flush()
    const expectedRange = { from_ts: '2026-06-24T13:30:00Z', to_ts: '2026-06-25T01:30:00Z' }
    expect(intervalsRequests().at(-1)?.time_range).toEqual(expectedRange)
    expect(cycleRequests().at(-1)?.time_range).toEqual(expectedRange)
  })

  it('refetches both endpoints on asset change, preserving the asset level', async () => {
    getMachineIntervals.mockResolvedValue(intervals(1))
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())
    await flush()

    hook.rerender(props({ asset: machine }))
    await flush()
    const expectedScope = { type: 'asset', asset: { asset_id: 'machine-id', asset_level_id: 10 } }
    expect(intervalsRequests().at(-1)?.entity_scope).toEqual(expectedScope)
    expect(cycleRequests().at(-1)?.entity_scope).toEqual(expectedScope)
  })

  it('does not refetch when re-rendered with equal but newly created filter objects', async () => {
    getMachineIntervals.mockResolvedValue(intervals(1))
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())
    await flush()

    hook.rerender(props({ asset: { ...line } }))
    await flush()
    expect(getMachineIntervals).toHaveBeenCalledTimes(1)
    expect(getCycleTimes).toHaveBeenCalledTimes(1)
  })

  it('never shows a slow response for an old selection after a newer one', async () => {
    const oldIntervals = deferred<MachineIntervals>()
    const newIntervals = deferred<MachineIntervals>()
    getMachineIntervals.mockReturnValueOnce(oldIntervals.promise).mockReturnValueOnce(newIntervals.promise)
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())

    hook.rerender(props({ asset: machine }))
    expect(getMachineIntervals.mock.calls[0]![1]?.aborted).toBe(true)
    newIntervals.resolve(intervals(3))
    await flush()
    oldIntervals.resolve(intervals(9))
    await flush()
    expect(hook.result.machineIntervals.state).toEqual({ status: 'success', data: intervals(3) })
  })

  it('refreshes every active request with the current filters without changing them', async () => {
    getMachineIntervals.mockResolvedValue(intervals(1))
    getCycleTimes.mockResolvedValue([])
    const current = props({ asset: machine, showIndividualProduces: true }, '2026-06-24', 1)
    const hook = render(current)
    await flush()
    expect(intervalsRequests().map((request) => request.exact_produces)).toEqual([false, true])

    act(() => hook.result.refresh())
    expect(hook.result.isLoading).toBe(true)
    await flush()
    expect(getMachineIntervals).toHaveBeenCalledTimes(4)
    expect(getCycleTimes).toHaveBeenCalledTimes(2)
    expect(intervalsRequests().slice(2)).toEqual(intervalsRequests().slice(0, 2))
    expect(cycleRequests()[1]).toEqual(cycleRequests()[0])
    expect(intervalsRequests()[3]).toMatchObject({
      entity_scope: { asset: { asset_id: 'machine-id', asset_level_id: 10 } },
      time_range: { from_ts: '2026-06-24T13:30:00Z', to_ts: '2026-06-25T01:30:00Z' },
      exact_produces: true,
    })
    expect(hook.result.isLoading).toBe(false)
  })

  it('keeps the summary data loaded while individual produces are requested, and drops them on toggle off', async () => {
    const produces = deferred<MachineIntervals>()
    getMachineIntervals.mockResolvedValueOnce(intervals(2)).mockReturnValueOnce(produces.promise)
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())
    await flush()

    hook.rerender(props({ showIndividualProduces: true }))
    expect(hook.result.machineIntervals.state).toEqual({ status: 'success', data: intervals(2) })
    expect(hook.result.individualProduces.state).toEqual({ status: 'loading' })

    hook.rerender(props({ showIndividualProduces: false }))
    expect(getMachineIntervals.mock.calls[1]![1]?.aborted).toBe(true)
    expect(hook.result.individualProduces.state).toEqual({ status: 'idle' })
    expect(hook.result.machineIntervals.state).toEqual({ status: 'success', data: intervals(2) })
    produces.resolve(intervals(9))
    await flush()
    expect(hook.result.individualProduces.state).toEqual({ status: 'idle' })
    expect(getMachineIntervals).toHaveBeenCalledTimes(2)
  })

  it('never shows individual produces from an earlier toggle-on after a rapid off/on', async () => {
    const first = deferred<MachineIntervals>()
    const second = deferred<MachineIntervals>()
    getMachineIntervals
      .mockResolvedValueOnce(intervals(1))
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    getCycleTimes.mockResolvedValue([])
    const hook = render(props())
    await flush()

    hook.rerender(props({ showIndividualProduces: true }))
    hook.rerender(props({ showIndividualProduces: false }))
    hook.rerender(props({ showIndividualProduces: true }))
    first.resolve(intervals(7))
    await flush()
    expect(hook.result.individualProduces.state).toEqual({ status: 'loading' })
    second.resolve(intervals(3))
    await flush()
    expect(hook.result.individualProduces.state).toEqual({ status: 'success', data: intervals(3) })
  })

  it('retries a failed individual-produces request together with the timeline, and only if it failed', async () => {
    getMachineIntervals
      .mockRejectedValueOnce(new ApiError('Internal Server Error', 500))
      .mockRejectedValueOnce(new ApiError('Internal Server Error', 500))
      .mockResolvedValue(intervals(1))
    getCycleTimes.mockResolvedValue([])
    const hook = render(props({ showIndividualProduces: true }))
    await flush()
    expect(hook.result.machineIntervals.state.status).toBe('error')
    expect(hook.result.individualProduces.state.status).toBe('error')

    act(() => hook.result.retryTimeline())
    await flush()
    expect(hook.result.machineIntervals.state.status).toBe('success')
    expect(hook.result.individualProduces.state.status).toBe('success')
    expect(getMachineIntervals).toHaveBeenCalledTimes(4)

    act(() => hook.result.retryTimeline())
    await flush()
    expect(getMachineIntervals).toHaveBeenCalledTimes(5)
    expect(intervalsRequests().at(-1)?.exact_produces).toBe(false)
  })

  it('keeps endpoint failures independent and retries only the failed one', async () => {
    const cycleBucket: CycleTimeBucket = {
      entity_type: 'asset',
      entity_id: 'line-id',
      asset_level_id: 20,
      bucket_start: '2026-06-23T03:00:00Z',
      ideal_cycle_time_seconds: 37,
      actual_cycle_time_seconds: 29,
    }
    getMachineIntervals
      .mockRejectedValueOnce(new ApiError('Internal Server Error', 500))
      .mockResolvedValueOnce(intervals(1))
    getCycleTimes.mockResolvedValue([cycleBucket])
    const hook = render(props())
    await flush()

    expect(hook.result.machineIntervals.state).toEqual({
      status: 'error',
      error: 'Something went wrong. Please try again.',
    })
    expect(hook.result.cycleTimes.state).toEqual({ status: 'success', data: [cycleBucket] })

    act(() => hook.result.machineIntervals.retry())
    await flush()
    expect(hook.result.machineIntervals.state).toEqual({ status: 'success', data: intervals(1) })
    expect(getCycleTimes).toHaveBeenCalledTimes(1)
  })
})
