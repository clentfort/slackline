import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import { openConversation, type SlackConversation } from '../conversation/open-conversation.js'
import { isLoggedInPage } from '../session/session-state.js'
import { pickLatestMessages, readVisibleMessages, type SlackMessage } from './read-visible-messages.js'

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
      await page.goto(options.workspaceUrl, { waitUntil: 'domcontentloaded' })

      const loggedIn = await isLoggedInPage(page, 15000)
      if (!loggedIn) {
        throw new Error('Not logged in to Slack. Run `slackline auth login` first.')
      }

      const conversation = await openConversation(page, {
        workspaceUrl: options.workspaceUrl,
        target: options.target,
      })

      const before = pickLatestMessages(await readVisibleMessages(page), 1)
      const previousTimestamp = before[0]?.timestampUnix
      const previousKey = messageKey(before[0])

      const composer = await locateComposer(page)
      await composer.click({ force: true })
      await composer.fill(options.message)
      await sendComposerMessage(page, composer)

      const posted = await waitForPostedMessage(page, options.message, {
        previousTimestamp,
        previousKey,
      })

      return {
        target: options.target,
        conversation,
        posted,
      }
    },
  )
}

async function sendComposerMessage(
  page: import('playwright').Page,
  composer: import('playwright').Locator,
): Promise<void> {
  const sendButton = page.locator('[data-qa="texty_send_button"]').first()
  const hasSendButton = (await sendButton.count()) > 0

  if (hasSendButton) {
    await sendButton.waitFor({ state: 'visible', timeout: 6000 })
    await page.waitForFunction(
      () => {
        const button = document.querySelector<HTMLButtonElement>('[data-qa="texty_send_button"]')
        if (!button) {
          return false
        }

        const ariaDisabled = button.getAttribute('aria-disabled')
        return !button.disabled && ariaDisabled !== 'true'
      },
      { timeout: 8000 },
    )
    await sendButton.click({ force: true })
    return
  }

  // Fallback for workspaces where send button is hidden.
  await composer.press('Enter')
}

async function locateComposer(page: import('playwright').Page): Promise<import('playwright').Locator> {
  const selectors = [
    '[data-qa="message_input"] [data-qa="texty_input"][contenteditable="true"]',
    '[data-qa="texty_input"][data-input-metric-boundary="composer"][contenteditable="true"]',
  ]

  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    try {
      await locator.waitFor({ state: 'visible', timeout: 7000 })
      return locator
    } catch {
      // Try next selector.
    }
  }

  throw new Error('Could not locate Slack message composer for this conversation.')
}

async function waitForPostedMessage(
  page: import('playwright').Page,
  expectedText: string,
  previous: {
    previousTimestamp?: number
    previousKey?: string
  },
): Promise<SlackMessage> {
  const deadline = Date.now() + 15000

  while (Date.now() < deadline) {
    const latest = pickLatestMessages(await readVisibleMessages(page), 1)[0]
    if (!latest) {
      await page.waitForTimeout(450)
      continue
    }

    const isNewer =
      typeof latest.timestampUnix !== 'number' ||
      typeof previous.previousTimestamp !== 'number' ||
      latest.timestampUnix > previous.previousTimestamp + 0.000001

    const isDifferentEntry = !previous.previousKey || messageKey(latest) !== previous.previousKey
    const sameText = latest.text.trim() === expectedText.trim()

    if (isDifferentEntry && isNewer && sameText) {
      return latest
    }

    await page.waitForTimeout(450)
  }

  throw new Error('Message may not have been posted yet. Please verify in Slack and retry if needed.')
}

function messageKey(message: SlackMessage | undefined): string | undefined {
  if (!message) {
    return undefined
  }

  return [
    message.user ?? '',
    message.timestampUnix?.toString() ?? '',
    message.timestampLabel ?? '',
    message.text,
  ].join('|')
}
