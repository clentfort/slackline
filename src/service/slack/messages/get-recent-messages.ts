import type { SlackConversation } from '../conversation/conversation-manager.js'
import { type SlackMessage, MessageManager } from './message-manager.js'
import { withSlackClient } from '../with-slack-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'

type GetRecentMessagesOptions = {
  target: string
  limit: number
  workspaceUrl?: string
  browser?: SlackBrowserOptions
}

export type SlackRecentMessagesResult = {
  target: string
  conversation: SlackConversation
  messages: SlackMessage[]
}

export async function getRecentMessages(options: GetRecentMessagesOptions): Promise<SlackRecentMessagesResult> {
  return withSlackClient(
    options,
    async (client) => {
      const conversation = await client.conversations.open({ target: options.target })

      await client.page.waitForTimeout(500)
      const visible = await client.messages.readVisible()

      return {
        target: options.target,
        conversation,
        messages: MessageManager.pickLatest(visible, options.limit),
      }
    },
  )
}
