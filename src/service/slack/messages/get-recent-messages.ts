import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import { openConversation, type SlackConversation } from '../conversation/open-conversation.js'
import { isLoggedInPage } from '../session/session-state.js'
import { pickLatestMessages, readVisibleMessages, type SlackMessage } from './read-visible-messages.js'

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
      await page.goto(options.workspaceUrl, { waitUntil: 'domcontentloaded' })

      const loggedIn = await isLoggedInPage(page, 15000)
      if (!loggedIn) {
        throw new Error('Not logged in to Slack. Run `slackline auth login` first.')
      }

      const conversation = await openConversation(page, {
        workspaceUrl: options.workspaceUrl,
        target: options.target,
      })

      await page.waitForTimeout(500)
      const visible = await readVisibleMessages(page)

      return {
        target: options.target,
        conversation,
        messages: pickLatestMessages(visible, options.limit),
      }
    },
  )
}
