import { describe, it, expect, vi } from 'vitest'
import { NotificationManager } from './notification-manager.js'
import type { SlackClient } from '../slack-client.js'

describe('NotificationManager', () => {
  it('should register init script and expose function', async () => {
    const mockPage = {
      exposeFunction: vi.fn(),
      addInitScript: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(undefined),
    }
    const mockClient = { page: mockPage } as unknown as SlackClient
    const manager = new NotificationManager(mockClient)

    const onEvent = vi.fn()
    await manager.listen(onEvent)

    expect(mockPage.exposeFunction).toHaveBeenCalledWith(
      'slacklineNotificationCallback',
      expect.any(Function),
    )
    expect(mockPage.addInitScript).toHaveBeenCalled()
    expect(mockPage.evaluate).toHaveBeenCalled()
  })

  it('should throw if called twice', async () => {
    const mockPage = {
      exposeFunction: vi.fn(),
      addInitScript: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(undefined),
    }
    const mockClient = { page: mockPage } as unknown as SlackClient
    const manager = new NotificationManager(mockClient)

    await manager.listen(vi.fn())
    await expect(manager.listen(vi.fn())).rejects.toThrow('Already listening for notifications.')
  })
})
