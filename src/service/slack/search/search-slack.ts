import { type SlackSearchResult, type SlackSearchItem } from './search-manager.js'
import { withSlackClient } from '../with-slack-client.js'

export { type SlackSearchResult, type SlackSearchItem }

type SearchSlackOptions = {
  query: string
  limit: number
}

export async function searchSlack(options: SearchSlackOptions): Promise<SlackSearchResult> {
  return withSlackClient({}, async (client) => {
    return client.search.search(options.query, options.limit)
  })
}
