import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import { SlackClient } from '../slack-client.js'
import { type SlackSearchResult, type SlackSearchItem } from './search-manager.js'

export { type SlackSearchResult, type SlackSearchItem }

type SearchSlackOptions = {
  workspaceUrl: string
  query: string
  limit: number
  browser?: SlackBrowserOptions
}

export async function searchSlack(options: SearchSlackOptions): Promise<SlackSearchResult> {
  return withSlackContext({
    headless: true,
    ...options.browser,
  }, async ({ page }) => {
    const client = new SlackClient(page)
    await client.navigateToWorkspace(options.workspaceUrl)
    await client.ensureLoggedIn()

    return client.search.search(options.query, options.limit)
  })
}
