import { type SlackSearchResult, type SlackSearchItem } from './search-manager.js'
import { withSlackClient } from '../with-slack-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'

export { type SlackSearchResult, type SlackSearchItem }

type SearchSlackOptions = {
  workspaceUrl: string
  query: string
  limit: number
  browser?: SlackBrowserOptions
}

export async function searchSlack(options: SearchSlackOptions): Promise<SlackSearchResult> {
  return withSlackClient({
    workspaceUrl: options.workspaceUrl,
    ensureLoggedIn: true,
    browser: options.browser,
  }, async (client) => {
    return client.search.search(options.query, options.limit)
  })
}
