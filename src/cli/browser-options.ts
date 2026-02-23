import type { SlackBrowserMode, SlackBrowserName, SlackBrowserOptions } from '../service/playwright/playwright-client.js'

export function browserOptionsFromArgv(argv: Record<string, unknown>): SlackBrowserOptions {
  const mode = normalizeBrowserMode(argv.browserMode)
  const browser = normalizeBrowserName(argv.browser)
  const cdpUrl = typeof argv.cdpUrl === 'string' && argv.cdpUrl.trim() ? argv.cdpUrl.trim() : undefined

  return {
    mode,
    browser,
    cdpUrl,
  }
}

function normalizeBrowserMode(raw: unknown): SlackBrowserMode {
  if (raw === 'attach' || raw === 'daemon' || raw === 'persistent') {
    return raw
  }
  return 'persistent'
}

function normalizeBrowserName(raw: unknown): SlackBrowserName {
  if (raw === 'firefox' || raw === 'chrome') {
    return raw
  }
  return 'chrome'
}
