import { beforeEach, describe, expect, it, vi } from 'vitest'

const after = vi.fn()
vi.mock('next/server', () => ({ after: (cb: () => unknown) => after(cb) }))

import { afterResponse } from '@/lib/afterResponse'

beforeEach(() => {
  after.mockReset()
})

describe('afterResponse', () => {
  it('returns before the task runs when after() schedules it', async () => {
    let scheduled: (() => unknown) | undefined
    after.mockImplementation((cb) => {
      scheduled = cb
    })
    const task = vi.fn(async () => undefined)
    await afterResponse(task)
    expect(task).not.toHaveBeenCalled()
    await scheduled!()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('awaits the task when after() throws outside a request scope', async () => {
    after.mockImplementation(() => {
      throw new Error('outside a request scope')
    })
    let done = false
    await afterResponse(async () => {
      await Promise.resolve()
      done = true
    })
    expect(done).toBe(true)
  })

  it('never rejects when the task rejects, in either mode', async () => {
    const rejecting = async () => {
      throw new Error('boom')
    }
    after.mockImplementation(() => {
      throw new Error('outside a request scope')
    })
    await expect(afterResponse(rejecting)).resolves.toBeUndefined()

    let scheduled: (() => unknown) | undefined
    after.mockImplementation((cb) => {
      scheduled = cb
    })
    await afterResponse(rejecting)
    await expect(Promise.resolve(scheduled!())).resolves.toBeUndefined()
  })
})
