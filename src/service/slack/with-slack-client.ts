import { withSlackContext, type SlackBrowserOptions } from '../playwright/playwright-client.js'
import { SlackClient } from './slack-client.js'
import { getConfig } from './config.js'

export type WithSlackClientOptions = {
  workspaceUrl?: string
  browser?: SlackBrowserOptions
  headless?: boolean
  skipLoginCheck?: boolean
}

export async function withSlackClient<T>(
  options: WithSlackClientOptions = {},
  callback: (client: SlackClient) => Promise<T>,
): Promise<T> {
  const config = getConfig()
  const workspaceUrl = options.workspaceUrl ?? config.workspaceUrl
  const browser = options.browser ?? config.browser

  return withSlackContext(
    {
      headless: options.headless ?? true,
      ...browser,
    },
    async ({ page }) => {
      const client = new SlackClient(page)

      if (workspaceUrl) {
        await client.navigateToWorkspace(workspaceUrl)
      }

      if (!options.skipLoginCheck) {
        await client.ensureLoggedIn()
      }

      return callback(client)
    },
  )
}
