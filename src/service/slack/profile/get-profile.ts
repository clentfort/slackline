import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import { extractNameFromUserLabel, extractWorkspaceName, isLoggedInPage } from '../session/session-state.js'

export type SlackProfile = {
  loggedIn: boolean
  name?: string
  workspace?: string
  url: string
}

type GetProfileOptions = {
  workspaceUrl: string
  browser?: SlackBrowserOptions
}

export async function getSlackProfile(options: GetProfileOptions): Promise<SlackProfile> {
  return withSlackContext({
    headless: true,
    ...options.browser,
  }, async ({ page }) => {
    await page.goto(options.workspaceUrl, { waitUntil: 'domcontentloaded' })

    const url = page.url()
    const loggedIn = await isLoggedInPage(page, 15000)
    if (!loggedIn) {
      return { loggedIn: false, url }
    }

    await page
      .waitForFunction(() => document.title.trim().length > 0 && document.title.trim().toLowerCase() !== 'slack', {
        timeout: 5000,
      })
      .catch(() => {})

    const details = await page.evaluate(() => {
      const normalize = (value: string | null | undefined): string | undefined => {
        if (!value) {
          return undefined
        }
        const cleaned = value.replace(/\s+/g, ' ').trim()
        return cleaned.length > 0 ? cleaned : undefined
      }

      const userButton = document.querySelector('button[data-qa="user-button"]')
      const searchButton = document.querySelector('button[data-qa="top_nav_search"]')

      return {
        userLabel: normalize(userButton?.getAttribute('aria-label')),
        searchButtonText: normalize(searchButton?.textContent),
        searchButtonAria: normalize(searchButton?.getAttribute('aria-label')),
        title: normalize(document.title),
      }
    })

    const name = extractNameFromUserLabel(details.userLabel)
    const workspace = extractWorkspaceName({
      title: details.title,
      searchButtonText: details.searchButtonText,
      searchButtonAria: details.searchButtonAria,
    })

    return {
      loggedIn: true,
      name,
      workspace,
      url,
    }
  })
}
