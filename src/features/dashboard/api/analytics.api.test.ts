import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from '../../../api/client'
import { ApiError, getErrorMessage } from '../../../api/errors'
import cycleTimeFixture from './__fixtures__/sample-analytics-query-cycle-time.json'
import machineIntervalsFixture from './__fixtures__/sample-machine-intervals.json'
import { analyticsApi } from './analytics.api'
import type { CycleTimeRequest, MachineIntervalsRequest } from './analytics.types'

const BASE_URL = 'https://backend.test'

const entityScope = {
  type: 'asset',
  asset: { asset_id: '283f3d3d-f1bb-410d-b299-84927ec8176e', asset_level_id: 20 },
} as const
const timeRange = { from_ts: '2026-06-23T07:00:00Z', to_ts: '2026-06-23T19:00:00Z' }

const intervalsRequest: MachineIntervalsRequest = {
  entity_scope: entityScope,
  time_range: timeRange,
  produce_counts: true,
  exact_produces: true,
  group_produce_counts_by_part_model: true,
}
const cycleTimeRequest: CycleTimeRequest = {
  entity_scope: entityScope,
  metrics: ['ideal_cycle_time_seconds', 'actual_cycle_time_seconds'],
  time_range: timeRange,
  distribution: 'hourly',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()
const onUnauthorized = vi.fn()

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', BASE_URL)
  vi.stubGlobal('fetch', fetchMock)
  configureApiClient({ getAccessToken: () => 'test-token', onUnauthorized })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fetchMock.mockReset()
  onUnauthorized.mockReset()
})

function sentRequest(callIndex = 0) {
  const [url, init] = fetchMock.mock.calls[callIndex]!
  const headers = new Headers(init?.headers)
  return { url, method: init?.method, body: JSON.parse(String(init?.body)), headers, signal: init?.signal }
}

describe('analyticsApi.getMachineIntervals', () => {
  it('posts the request through the central client and unwraps the envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, machineIntervalsFixture))
    const result = await analyticsApi.getMachineIntervals(intervalsRequest)

    const sent = sentRequest()
    expect(sent.url).toBe(`${BASE_URL}/analytics-query/machine-intervals`)
    expect(sent.method).toBe('POST')
    expect(sent.body).toEqual(intervalsRequest)
    expect(sent.headers.get('Authorization')).toBe('Bearer test-token')
    expect(sent.headers.get('Content-Type')).toBe('application/json')
    expect(result.runtimes).toEqual(machineIntervalsFixture.data.runtimes)
    expect(result.produces).toEqual(machineIntervalsFixture.data.produces)
  })

  it('normalizes the live empty-asset payload', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        trace_id: 't',
        status_code: 200,
        message: 'OK',
        data: {
          machine_ids: [],
          runtimes: [],
          stoppages: [],
          downtimes: [],
          produce_counts: null,
          produces: null,
          metrics: null,
        },
      }),
    )
    const result = await analyticsApi.getMachineIntervals(intervalsRequest)
    expect(result.produce_counts).toEqual([])
  })

  it('forwards the abort signal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, machineIntervalsFixture))
    const controller = new AbortController()
    await analyticsApi.getMachineIntervals(intervalsRequest, controller.signal)
    expect(sentRequest().signal).toBe(controller.signal)
  })

  it('retries a 5xx response with backoff and then succeeds', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(500, { trace_id: 't', status_code: 500, message: 'Internal Server Error', data: null }),
      )
      .mockResolvedValueOnce(jsonResponse(200, machineIntervalsFixture))
    const pending = analyticsApi.getMachineIntervals(intervalsRequest)
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toMatchObject({ machine_ids: [1, 2, 3] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the configured retries', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () =>
      jsonResponse(503, { trace_id: 't', status_code: 503, message: 'Unavailable', data: null }),
    )
    const pending = analyticsApi.getMachineIntervals(intervalsRequest)
    const assertion = expect(pending).rejects.toMatchObject({ status: 503 })
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces a 422 as a non-retried ApiError carrying the field errors', async () => {
    const details = { errors: [{ type: 'missing', loc: ['body', 'time_range'], msg: 'Field required' }] }
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { trace_id: 't', status_code: 422, message: 'Validation error', data: details }),
    )
    const error = await analyticsApi.getMachineIntervals(intervalsRequest).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, message: 'Validation error', details })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows "access denied" for a 403 without ending the session', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { trace_id: 't', status_code: 403, message: 'Forbidden', data: null }),
    )
    const error = await analyticsApi.getMachineIntervals(intervalsRequest).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 403 })
    expect(getErrorMessage(error)).toBe('Access denied.')
    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a 401 to the session handler', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        trace_id: 't',
        status_code: 401,
        message: 'Session expired — please log in again.',
        data: null,
      }),
    )
    await expect(analyticsApi.getMachineIntervals(intervalsRequest)).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})

describe('analyticsApi.getCycleTimes', () => {
  it('posts the hourly cycle-time request and returns the buckets', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, cycleTimeFixture))
    const result = await analyticsApi.getCycleTimes(cycleTimeRequest)

    const sent = sentRequest()
    expect(sent.url).toBe(`${BASE_URL}/analytics-query`)
    expect(sent.method).toBe('POST')
    expect(sent.body).toEqual(cycleTimeRequest)
    expect(sent.headers.get('Authorization')).toBe('Bearer test-token')
    expect(
      result.map((bucket) => [bucket.bucket_start, bucket.ideal_cycle_time_seconds, bucket.actual_cycle_time_seconds]),
    ).toEqual([
      ['2026-06-23T07:00:00Z', 307, 412.5],
      ['2026-06-23T08:00:00Z', 307, 389.2],
      ['2026-06-23T09:00:00Z', null, null],
    ])
    expect(result[0]?.entity_type).toBe('asset')
  })

  it('returns an empty list as a valid result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { trace_id: 't', status_code: 200, message: 'OK', data: [] }))
    await expect(analyticsApi.getCycleTimes(cycleTimeRequest)).resolves.toEqual([])
  })
})
