// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { deferred, flush, renderHook } from '../test/renderHook'
import { useAsyncResource, type ResourceLoader } from './useAsyncResource'

function controllableLoader<T>() {
  const calls: { signal: AbortSignal; settle: ReturnType<typeof deferred<T>> }[] = []
  const load = vi.fn<ResourceLoader<T>>((signal) => {
    const settle = deferred<T>()
    calls.push({ signal, settle })
    return settle.promise
  })
  return { load, calls }
}

describe('useAsyncResource', () => {
  it('stays idle and does not load without a loader', () => {
    const hook = renderHook(useAsyncResource<string>, null)
    expect(hook.result.state).toEqual({ status: 'idle' })
  })

  it('moves from loading to success', async () => {
    const { load, calls } = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, load)
    expect(hook.result.state).toEqual({ status: 'loading' })
    calls[0]!.settle.resolve('data')
    await flush()
    expect(hook.result.state).toEqual({ status: 'success', data: 'data' })
  })

  it('treats an empty successful result as success', async () => {
    const hook = renderHook(useAsyncResource<string[]>, () => Promise.resolve([]))
    await flush()
    expect(hook.result.state).toEqual({ status: 'success', data: [] })
  })

  it('exposes a user-facing message for API errors', async () => {
    const hook = renderHook(useAsyncResource<string>, () =>
      Promise.reject(
        new ApiError('Validation error', 422, {
          details: { errors: [{ loc: ['body', 'time_range'], msg: 'Field required' }] },
        }),
      ),
    )
    await flush()
    expect(hook.result.state).toEqual({ status: 'error', error: 'Validation error: time_range: Field required' })
  })

  it('never exposes server error details for 5xx', async () => {
    const hook = renderHook(useAsyncResource<string>, () => Promise.reject(new ApiError('Traceback: boom', 500)))
    await flush()
    expect(hook.result.state).toEqual({ status: 'error', error: 'Something went wrong. Please try again.' })
  })

  it('ignores an obsolete response that resolves after a newer request', async () => {
    const first = controllableLoader<string>()
    const second = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, first.load)
    hook.rerender(second.load)

    expect(first.calls[0]!.signal.aborted).toBe(true)
    second.calls[0]!.settle.resolve('new')
    await flush()
    first.calls[0]!.settle.resolve('old')
    await flush()
    expect(hook.result.state).toEqual({ status: 'success', data: 'new' })
  })

  it('does not show previous data as current while the next request loads', async () => {
    const first = controllableLoader<string>()
    const second = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, first.load)
    first.calls[0]!.settle.resolve('old')
    await flush()
    hook.rerender(second.load)
    expect(hook.result.state).toEqual({ status: 'loading' })
  })

  it('does not report a cancelled request as an error', async () => {
    const first = controllableLoader<string>()
    const second = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, first.load)
    hook.rerender(second.load)
    first.calls[0]!.settle.reject(new DOMException('The operation was aborted.', 'AbortError'))
    await flush()
    expect(hook.result.state).toEqual({ status: 'loading' })
  })

  it('retries with the same loader after a failure', async () => {
    const { load, calls } = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, load)
    calls[0]!.settle.reject(new ApiError('Unavailable', 503))
    await flush()
    expect(hook.result.state.status).toBe('error')

    act(() => hook.result.retry())
    expect(hook.result.state).toEqual({ status: 'loading' })
    expect(load).toHaveBeenCalledTimes(2)
    calls[1]!.settle.resolve('recovered')
    await flush()
    expect(hook.result.state).toEqual({ status: 'success', data: 'recovered' })
  })

  it('cancels the in-flight request when retried and ignores its result', async () => {
    const { load, calls } = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, load)
    act(() => hook.result.retry())
    expect(calls[0]!.signal.aborted).toBe(true)
    calls[0]!.settle.resolve('stale')
    await flush()
    expect(hook.result.state).toEqual({ status: 'loading' })
    calls[1]!.settle.resolve('fresh')
    await flush()
    expect(hook.result.state).toEqual({ status: 'success', data: 'fresh' })
  })

  it('aborts the request on unmount', () => {
    const { load, calls } = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, load)
    hook.unmount()
    expect(calls[0]!.signal.aborted).toBe(true)
  })

  it('records when the current request settled, and clears it while a new one loads', async () => {
    const { load, calls } = controllableLoader<string>()
    const hook = renderHook(useAsyncResource<string>, load)
    expect(hook.result.settledAtMs).toBeNull()
    const before = Date.now()
    calls[0]!.settle.resolve('data')
    await flush()
    expect(hook.result.settledAtMs).toBeGreaterThanOrEqual(before)
    act(() => hook.result.retry())
    expect(hook.result.settledAtMs).toBeNull()
  })
})
