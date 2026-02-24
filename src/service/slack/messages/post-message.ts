import type { SlackConversation } from '../conversation/conversation-manager.js'
import type { SlackMessage } from './message-manager.js'
import { withSlackClient } from '../with-slack-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'

type PostMessageOptions = {
  target: string
  message: string
  workspaceUrl?: string
  browser?: SlackBrowserOptions
}

export type SlackPostMessageResult = {
  target: string
  conversation: SlackConversation
  posted: SlackMessage
}

export async function postMessage(options: PostMessageOptions): Promise<SlackPostMessageResult> {
  return withSlackClient(
    options,
    async (client) => {
      const conversation = await client.conversations.open(options)

      const posted = await client.messages.post(options.message)

      return {
        target: options.target,
        conversation,
        posted,
      }
    },
  )
}
