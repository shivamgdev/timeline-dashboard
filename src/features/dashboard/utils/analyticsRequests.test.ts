import { describe, expect, it } from 'vitest'
import type { AssetOption } from '../types'
import { buildAnalyticsScope, buildCycleTimeRequest, buildMachineIntervalsRequest } from './analyticsRequests'
import { buildShiftSlots, buildShiftWindow } from './shifts'

const smtLine: AssetOption = {
  assetId: '283f3d3d-f1bb-410d-b299-84927ec8176e',
  assetLevelId: 20,
  name: 'SMT Line 1',
  codename: 'LINE-01',
  groupLabel: 'Noida',
  depth: 0,
}

function scopeFor(asset: AssetOption, date: string, timings: string[], index: number) {
  const result = buildShiftSlots({ id: 's', code: 'main', name: 'main', shift_timings: timings, is_active: true })
  if (!result.ok) throw new Error(result.error)
  return buildAnalyticsScope(asset, buildShiftWindow(date, result.slots[index]!))
}

describe('buildMachineIntervalsRequest', () => {
  it('matches the documented request for the 12:30–00:30 IST shift on 23 June', () => {
    expect(buildMachineIntervalsRequest(scopeFor(smtLine, '2026-06-23', ['00:30', '12:30'], 1), false)).toEqual({
      entity_scope: {
        type: 'asset',
        asset: { asset_id: '283f3d3d-f1bb-410d-b299-84927ec8176e', asset_level_id: 20 },
      },
      time_range: { from_ts: '2026-06-23T07:00:00Z', to_ts: '2026-06-23T19:00:00Z' },
      produce_counts: true,
      exact_produces: false,
      group_produce_counts_by_part_model: true,
    })
  })

  it('requests individual produces only when the toggle is on', () => {
    const scope = scopeFor(smtLine, '2026-06-23', ['07:00', '19:00'], 0)
    expect(buildMachineIntervalsRequest(scope, true).exact_produces).toBe(true)
    expect(buildMachineIntervalsRequest(scope, false).exact_produces).toBe(false)
  })

  it('uses the UTC bounds of the IST shift window, including the next-day end', () => {
    const request = buildMachineIntervalsRequest(scopeFor(smtLine, '2026-06-23', ['07:00', '19:00'], 1), false)
    expect(request.time_range).toEqual({ from_ts: '2026-06-23T13:30:00Z', to_ts: '2026-06-24T01:30:00Z' })
  })

  it('keeps the asset level of the selected node', () => {
    const machine: AssetOption = { ...smtLine, assetId: '04f3a8b2-6c1d-4e9f-8a5b-2d7c9e1f4a6b', assetLevelId: 10 }
    expect(buildMachineIntervalsRequest(scopeFor(machine, '2026-06-23', ['07:00'], 0), false).entity_scope).toEqual({
      type: 'asset',
      asset: { asset_id: '04f3a8b2-6c1d-4e9f-8a5b-2d7c9e1f4a6b', asset_level_id: 10 },
    })
  })
})

describe('buildCycleTimeRequest', () => {
  it('matches the documented hourly cycle-time request', () => {
    expect(buildCycleTimeRequest(scopeFor(smtLine, '2026-06-23', ['00:30', '12:30'], 1))).toEqual({
      entity_scope: {
        type: 'asset',
        asset: { asset_id: '283f3d3d-f1bb-410d-b299-84927ec8176e', asset_level_id: 20 },
      },
      metrics: ['ideal_cycle_time_seconds', 'actual_cycle_time_seconds'],
      time_range: { from_ts: '2026-06-23T07:00:00Z', to_ts: '2026-06-23T19:00:00Z' },
      distribution: 'hourly',
    })
  })

  it('uses the same scope as the machine-intervals request for one filter snapshot', () => {
    const scope = scopeFor(smtLine, '2026-06-23', ['07:00', '19:00'], 0)
    const intervals = buildMachineIntervalsRequest(scope, true)
    const cycleTimes = buildCycleTimeRequest(scope)
    expect(cycleTimes.entity_scope).toEqual(intervals.entity_scope)
    expect(cycleTimes.time_range).toEqual(intervals.time_range)
  })
})
