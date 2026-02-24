import { describe, it, expect } from 'vitest'
import { notificationInjectionScript } from './browser-scripts.js'

describe('notificationInjectionScript', () => {
  it('should be a function', () => {
    expect(typeof notificationInjectionScript).toBe('function')
  })

  it('should be stringifiable', () => {
    const str = notificationInjectionScript.toString()
    expect(str).toContain('window.Notification')
    expect(str).toContain('MutationObserver')
  })
})
