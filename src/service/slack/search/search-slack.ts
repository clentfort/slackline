import { type SlackSearchResult, type SlackSearchItem } from './search-manager.js'
import { withSlackClient } from '../with-slack-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'

export { type SlackSearchResult, type SlackSearchItem }

type SearchSlackOptions = {
  query: string
  limit: number
  workspaceUrl?: string
  browser?: SlackBrowserOptions
}

export async function searchSlack(options: SearchSlackOptions): Promise<SlackSearchResult> {
  return withSlackClient(options, async (client) => {
    return client.search.search(options.query, options.limit)
  })
}
