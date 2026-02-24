import { type SlackProfile } from './profile-manager.js'
import { withSlackClient } from '../with-slack-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'

export { type SlackProfile }

type GetProfileOptions = {
  workspaceUrl?: string
  browser?: SlackBrowserOptions
}

export async function getSlackProfile(options: GetProfileOptions): Promise<SlackProfile> {
  return withSlackClient(options, async (client) => {
    return client.profile.get()
  })
}
