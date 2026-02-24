import type { SlackBrowserOptions } from '../playwright/playwright-client.js'
import { defaultSlackWorkspaceUrl } from './defaults.js'

export type SlackConfig = {
  workspaceUrl: string
  browser: SlackBrowserOptions
}

const currentConfig: SlackConfig = {
  workspaceUrl: process.env.SLACKLINE_WORKSPACE_URL ?? defaultSlackWorkspaceUrl,
  browser: {
    cdpUrl: process.env.SLACKLINE_CDP_URL ?? 'http://127.0.0.1:9222',
  },
}

export function setConfig(config: Partial<SlackConfig>): void {
  if (config.workspaceUrl) {
    currentConfig.workspaceUrl = config.workspaceUrl
  }
  if (config.browser) {
    currentConfig.browser = { ...currentConfig.browser, ...config.browser }
  }
}

export function getConfig(): SlackConfig {
  return currentConfig
}
