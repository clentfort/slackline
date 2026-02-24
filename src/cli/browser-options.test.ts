import { describe, it, expect } from 'vitest'
import { browserOptionsFromArgv } from './browser-options.js'
import type { GlobalOptions } from './index.js'

describe('browserOptionsFromArgv', () => {
  const defaultGlobalOptions: GlobalOptions = {
    verbose: false,
    workspaceUrl: 'https://app.slack.com/client/T123/C456',
    browserMode: 'persistent',
    browser: 'chrome',
    cdpUrl: 'http://127.0.0.1:9222',
  }

  it('should correctly transform default options', () => {
    const result = browserOptionsFromArgv(defaultGlobalOptions)
    expect(result).toEqual({
      mode: 'persistent',
      browser: 'chrome',
      cdpUrl: 'http://127.0.0.1:9222',
    })
  })

  it('should handle different browser modes', () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      browserMode: 'attach',
    })
    expect(result.mode).toBe('attach')
  })

  it('should handle different browsers', () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      browser: 'firefox',
    })
    expect(result.browser).toBe('firefox')
  })

  it('should trim cdpUrl', () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      cdpUrl: '  http://localhost:9222  ',
    })
    expect(result.cdpUrl).toBe('http://localhost:9222')
  })

  it('should return undefined for empty cdpUrl after trim', () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      cdpUrl: '   ',
    })
    expect(result.cdpUrl).toBeUndefined()
  })
})
