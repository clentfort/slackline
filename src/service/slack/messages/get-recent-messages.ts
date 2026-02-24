import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import type { SlackConversation } from '../conversation/conversation-manager.js'
import { SlackClient } from '../slack-client.js'
import type { SlackMessage } from './message-manager.js'

type GetRecentMessagesOptions = {
  workspaceUrl: string
  target: string
  limit: number
  browser?: SlackBrowserOptions
}

export type SlackRecentMessagesResult = {
  target: string
  conversation: SlackConversation
  messages: SlackMessage[]
}

export async function getRecentMessages(options: GetRecentMessagesOptions): Promise<SlackRecentMessagesResult> {
  return withSlackContext(
    {
      headless: true,
      ...options.browser,
    },
    async ({ page }) => {
      const client = new SlackClient(page)
      await client.navigateToWorkspace(options.workspaceUrl)
      await client.ensureLoggedIn()

      const conversation = await client.conversations.open({
        workspaceUrl: options.workspaceUrl,
        target: options.target,
      })

      await page.waitForTimeout(500)
      const visible = await client.messages.readVisible()

      return {
        target: options.target,
        conversation,
        messages: MessageManager.pickLatest(visible, options.limit),
      }
    },
  )
}
