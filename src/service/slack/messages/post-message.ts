import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import type { SlackConversation } from '../conversation/conversation-manager.js'
import { SlackClient } from '../slack-client.js'
import type { SlackMessage } from './message-manager.js'

type PostMessageOptions = {
  workspaceUrl: string
  target: string
  message: string
  browser?: SlackBrowserOptions
}

export type SlackPostMessageResult = {
  target: string
  conversation: SlackConversation
  posted: SlackMessage
}

export async function postMessage(options: PostMessageOptions): Promise<SlackPostMessageResult> {
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

      const posted = await client.messages.post(options.message)

      return {
        target: options.target,
        conversation,
        posted,
      }
    },
  )
}
