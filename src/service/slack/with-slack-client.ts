import { withSlackContext, type SlackBrowserOptions } from '../playwright/playwright-client.js'
import { SlackClient } from './slack-client.js'

export type WithSlackClientOptions = {
  workspaceUrl?: string
  browser?: SlackBrowserOptions
  headless?: boolean
  ensureLoggedIn?: boolean
}

export async function withSlackClient<T>(
  options: WithSlackClientOptions,
  callback: (client: SlackClient) => Promise<T>,
): Promise<T> {
  return withSlackContext(
    {
      headless: options.headless ?? true,
      ...options.browser,
    },
    async ({ page }) => {
      const client = new SlackClient(page)

      if (options.workspaceUrl) {
        await client.navigateToWorkspace(options.workspaceUrl)
      }

      if (options.ensureLoggedIn) {
        await client.ensureLoggedIn()
      }

      return callback(client)
    },
  )
}
