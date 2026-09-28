// @vitest-environment happy-dom
import { ThemeProvider } from '@mui/material/styles'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { TimelineChartModel } from '../../features/dashboard/timeline/chartModel'
import '../../test/renderHook'
import { theme } from '../../theme/theme'
import TimelineChart from './TimelineChart'

interface FakeChart {
  disposed: boolean
  calls: string[]
}

const created: FakeChart[] = []

vi.mock('./echarts', () => ({
  echarts: {
    init: () => {
      const state: FakeChart = { disposed: false, calls: [] }
      created.push(state)
      const guard = (name: string) => () => {
        if (state.disposed) throw new Error(`${name} called on a disposed chart`)
        state.calls.push(name)
      }
      const zr = { on: guard('zr.on'), off: guard('zr.off') }
      return {
        setOption: guard('setOption'),
        dispatchAction: guard('dispatchAction'),
        on: guard('on'),
        off: guard('off'),
        resize: guard('resize'),
        getZr: () => (state.disposed ? null : zr),
        dispose: () => {
          state.disposed = true
        },
      }
    },
  },
}))

function model(windowStartMs: number): TimelineChartModel {
  return {
    windowStartMs,
    windowEndMs: windowStartMs + 3_600_000,
    segments: [],
    markers: { mode: 'hourly', hourly: [], bucketsOutsideWindow: 0 },
    yMax: 0,
  }
}

describe('TimelineChart lifecycle', () => {
  it('never touches a disposed chart across StrictMode remounts, model changes and unmount', () => {
    const root = createRoot(document.createElement('div'))
    const render = (value: TimelineChartModel) =>
      act(() =>
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(ThemeProvider, { theme }, createElement(TimelineChart, { model: value })),
          ),
        ),
      )

    expect(() => {
      render(model(0))
      render(model(3_600_000))
      act(() => root.unmount())
    }).not.toThrow()

    expect(created.every((chart) => chart.disposed)).toBe(true)
    const live = created.at(-1)!
    expect(live.calls.filter((call) => call === 'setOption')).toHaveLength(2)
  })
})
