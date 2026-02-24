import type { Page } from 'playwright'
import { SlackClient } from '../slack-client.js'
import { type SlackConversation } from './conversation-manager.js'

export { type SlackConversation }

export async function openConversation(page: Page, options: { workspaceUrl: string; target?: string }): Promise<SlackConversation> {
  const client = new SlackClient(page)
  return client.conversations.open(options)
}
