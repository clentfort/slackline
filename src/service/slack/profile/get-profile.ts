import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import { SlackClient } from '../slack-client.js'
import { type SlackProfile } from './profile-manager.js'

export { type SlackProfile }

type GetProfileOptions = {
  workspaceUrl: string
  browser?: SlackBrowserOptions
}

export async function getSlackProfile(options: GetProfileOptions): Promise<SlackProfile> {
  return withSlackContext({
    headless: true,
    ...options.browser,
  }, async ({ page }) => {
    const client = new SlackClient(page)
    await client.navigateToWorkspace(options.workspaceUrl)

    return client.profile.get()
  })
}
