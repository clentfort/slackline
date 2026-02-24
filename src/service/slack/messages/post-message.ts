import type { SlackConversation } from '../conversation/conversation-manager.js'
import type { SlackMessage } from './message-manager.js'
import { withSlackClient } from '../with-slack-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'

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
  return withSlackClient(
    {
      workspaceUrl: options.workspaceUrl,
      ensureLoggedIn: true,
      browser: options.browser,
    },
    async (client) => {
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
