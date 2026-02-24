import { chromium, type BrowserContext, type Page } from 'playwright'

import { startSlackDaemon } from './daemon-manager.js'

export type SlackBrowserOptions = {
  cdpUrl?: string
  chromePath?: string
}

type WithSlackContextOptions = SlackBrowserOptions & {
  headless: boolean
}

export async function withSlackContext<T>(
  options: WithSlackContextOptions,
  callback: (value: { context: BrowserContext; page: Page }) => Promise<T>,
): Promise<T> {
  const status = await startSlackDaemon({
    cdpUrl: options.cdpUrl ?? 'http://127.0.0.1:9222',
    headless: options.headless,
    chromePath: options.chromePath,
  })

  const connectedBrowser = await chromium.connectOverCDP(status.cdpUrl)
  const context = connectedBrowser.contexts()[0]
  if (!context) {
    throw new Error(`No browser context available at CDP endpoint ${status.cdpUrl}`)
  }

  const slackPage = context
    .pages()
    .find((page) => !page.isClosed() && /https?:\/\/app\.slack\.com\//i.test(page.url()))

  let page: Page
  if (slackPage) {
    page = slackPage
  } else {
    const existingPage = context.pages().find((page) => !page.isClosed())
    page = existingPage ?? (await context.newPage())
  }

  try {
    return await callback({ context, page })
  } finally {
    await connectedBrowser.close().catch(() => {})
  }
}
