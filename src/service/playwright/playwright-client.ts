import path from 'node:path'

import { chromium, firefox, type BrowserContext, type Page } from 'playwright'

import { resolveDaemonCdpUrl } from './daemon-manager.js'

const projectRoot = process.cwd()
const stateDir = path.resolve(projectRoot, '.slackline')
const chromeProfileDir = path.resolve(stateDir, 'chrome-profile')
const firefoxProfileDir = path.resolve(stateDir, 'firefox-profile')

export type SlackBrowserMode = 'persistent' | 'attach' | 'daemon'
export type SlackBrowserName = 'chrome' | 'firefox'

export type SlackBrowserOptions = {
  mode?: SlackBrowserMode
  browser?: SlackBrowserName
  cdpUrl?: string
}

type WithSlackContextOptions = SlackBrowserOptions & {
  headless: boolean
}

export async function withSlackContext<T>(
  options: WithSlackContextOptions,
  callback: (value: { context: BrowserContext; page: Page }) => Promise<T>,
): Promise<T> {
  const mode = options.mode ?? 'persistent'
  const browser = options.browser ?? 'chrome'

  if (mode === 'persistent') {
    const context = await launchPersistentContext({
      browser,
      headless: options.headless,
    })

    const page = context.pages()[0] ?? (await context.newPage())

    try {
      return await callback({ context, page })
    } finally {
      try {
        await context.close()
      } catch {
        // Context may already be closed by user interaction.
      }
    }
  }

  if (browser !== 'chrome') {
    throw new Error('Attach/daemon mode currently supports Chrome only.')
  }

  const cdpUrl = await resolveCdpUrl({
    mode,
    cdpUrl: options.cdpUrl,
  })

  const connectedBrowser = await chromium.connectOverCDP(cdpUrl)
  const context = connectedBrowser.contexts()[0]
  if (!context) {
    throw new Error(`No browser context available at CDP endpoint ${cdpUrl}`)
  }

  const pageSelection = await selectAttachPage(context, mode)
  const page = pageSelection.page

  try {
    return await callback({ context, page })
  } finally {
    if (pageSelection.closeOnFinish) {
      await page.close().catch(() => {})
    }
    await connectedBrowser.close().catch(() => {})
  }
}

async function launchPersistentContext(options: {
  browser: SlackBrowserName
  headless: boolean
}): Promise<BrowserContext> {
  if (options.browser === 'firefox') {
    return firefox.launchPersistentContext(firefoxProfileDir, {
      headless: options.headless,
      viewport: { width: 1440, height: 900 },
    })
  }

  return chromium.launchPersistentContext(chromeProfileDir, {
    headless: options.headless,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    args: ['--disable-features=DialMediaRouteProvider'],
  })
}

async function resolveCdpUrl(options: {
  mode: SlackBrowserMode
  cdpUrl?: string
}): Promise<string> {
  if (options.cdpUrl?.trim()) {
    return options.cdpUrl.trim()
  }

  if (options.mode === 'daemon') {
    return resolveDaemonCdpUrl()
  }

  return 'http://127.0.0.1:9222'
}

async function selectAttachPage(
  context: BrowserContext,
  mode: SlackBrowserMode,
): Promise<{ page: Page; closeOnFinish: boolean }> {
  if (mode === 'attach') {
    const page = await context.newPage()
    return {
      page,
      closeOnFinish: true,
    }
  }

  const slackPage = context
    .pages()
    .find((page) => !page.isClosed() && /https?:\/\/app\.slack\.com\//i.test(page.url()))

  if (slackPage) {
    return {
      page: slackPage,
      closeOnFinish: false,
    }
  }

  const existingPage = context.pages().find((page) => !page.isClosed())
  if (existingPage) {
    return {
      page: existingPage,
      closeOnFinish: false,
    }
  }

  const createdPage = await context.newPage()

  return {
    page: createdPage,
    closeOnFinish: false,
  }
}
