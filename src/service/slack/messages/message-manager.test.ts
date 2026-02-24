import { describe, it, expect } from 'vitest'
import { MessageManager, type SlackMessage } from './message-manager.js'

describe('MessageManager', () => {
  describe('pickLatest', () => {
    it('should return the latest messages in reverse order', () => {
      const messages: SlackMessage[] = [
        { text: 'first', timestampUnix: 1 },
        { text: 'second', timestampUnix: 2 },
        { text: 'third', timestampUnix: 3 },
      ]

      const latest = MessageManager.pickLatest(messages, 2)
      expect(latest).toHaveLength(2)
      expect(latest[0].text).toBe('third')
      expect(latest[1].text).toBe('second')
    })

    it('should deduplicate messages', () => {
      const messages: SlackMessage[] = [
        { user: 'A', text: 'hi', timestampLabel: '10:00' },
        { user: 'A', text: 'hi', timestampLabel: '10:00' },
        { user: 'B', text: 'hello', timestampLabel: '10:01' },
      ]

      const latest = MessageManager.pickLatest(messages, 10)
      expect(latest).toHaveLength(2)
      expect(latest[0].text).toBe('hello')
      expect(latest[1].text).toBe('hi')
    })
  })
})
