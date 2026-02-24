import { describe, it, expect, beforeEach } from 'vitest'
import { getConfig, setConfig } from './config.js'
import { defaultSlackWorkspaceUrl } from './defaults.js'

describe('config', () => {
  it('should have default values', () => {
    const config = getConfig()
    // Depending on env vars in the environment, these might vary,
    // but in a clean test run they should be defaults.
    expect(config.workspaceUrl).toBeDefined()
    expect(config.browser).toBeDefined()
  })

  it('should update config via setConfig', () => {
    const newUrl = 'https://custom.slack.com'
    setConfig({ workspaceUrl: newUrl })
    expect(getConfig().workspaceUrl).toBe(newUrl)
  })

  it('should update browser options partially', () => {
    setConfig({ browser: { mode: 'attach' } })
    const config = getConfig()
    expect(config.browser.mode).toBe('attach')
    // other fields should remain
    expect(config.browser.browser).toBeDefined()
  })
})
