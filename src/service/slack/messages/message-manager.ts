import type { Locator } from 'playwright'
import { SlackComponent } from '../slack-client.js'

export type SlackMessage = {
  user?: string
  text: string
  timestampLabel?: string
  timestampUnix?: number
  timestampIso?: string
}

export class MessageManager extends SlackComponent {
  async readVisible(): Promise<SlackMessage[]> {
    return this.page.locator('[data-qa="message_container"]').evaluateAll((nodes) => {
      const normalize = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

      const parseUnixSeconds = (value: string | null | undefined): number | undefined => {
        const numeric = Number.parseFloat((value ?? '').trim())
        return Number.isFinite(numeric) ? numeric : undefined
      }

      const parsed: {
        user?: string
        text: string
        timestampLabel?: string
        timestampUnix?: number
        timestampIso?: string
      }[] = []
      let lastUser: string | undefined

      for (const node of nodes) {
        const text =
          normalize(node.querySelector('[data-qa="message-text"]')?.textContent) ||
          normalize(node.querySelector('.c-message__body')?.textContent)

        if (!text) {
          continue
        }

        const rawSender =
          normalize(node.querySelector('[data-qa="message_sender_name"]')?.textContent) ||
          normalize(node.querySelector('[data-qa*="-sender"]')?.textContent)

        const senderFromNode = rawSender ? rawSender.replace(/:$/, '').trim() : undefined
        const user = senderFromNode || lastUser
        if (senderFromNode) {
          lastUser = senderFromNode
        }

        const timestampLabel = normalize(node.querySelector('[data-qa="timestamp_label"]')?.textContent) || undefined

        const timestampUnix =
          parseUnixSeconds(node.getAttribute('data-msg-ts')) ||
          parseUnixSeconds(node.querySelector('[data-ts]')?.getAttribute('data-ts'))

        const timestampIso =
          typeof timestampUnix === 'number' ? new Date(timestampUnix * 1000).toISOString() : undefined

        parsed.push({
          user,
          text,
          timestampLabel,
          timestampUnix,
          timestampIso,
        })
      }

      return parsed
    })
  }

  async post(text: string): Promise<SlackMessage> {
    const before = MessageManager.pickLatest(await this.readVisible(), 1)
    const previousTimestamp = before[0]?.timestampUnix
    const previousKey = this.messageKey(before[0])

    const composer = await this.locateComposer()
    await composer.click({ force: true })
    await composer.fill(text)
    await this.sendComposerMessage(composer)

    return this.waitForPosted(text, {
      previousTimestamp,
      previousKey,
    })
  }

  static pickLatest(messages: SlackMessage[], limit: number): SlackMessage[] {
    const deduped = MessageManager.dedupe(messages)
    const safeLimit = Math.max(0, limit)
    const latest = deduped.slice(-safeLimit)
    return latest.reverse()
  }

  private static dedupe(messages: SlackMessage[]): SlackMessage[] {
    const seen = new Set<string>()
    const deduped: SlackMessage[] = []

    for (const message of messages) {
      const key = [message.user ?? '', message.timestampLabel ?? '', message.text].join('|')

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      deduped.push(message)
    }

    return deduped
  }

  private async sendComposerMessage(composer: Locator): Promise<void> {
    const sendButton = this.page.locator('[data-qa="texty_send_button"]').first()
    const hasSendButton = (await sendButton.count()) > 0

    if (hasSendButton) {
      await sendButton.waitFor({ state: 'visible', timeout: 6000 })
      await this.page.waitForFunction(
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

  private async locateComposer(): Promise<Locator> {
    const selectors = [
      '[data-qa="message_input"] [data-qa="texty_input"][contenteditable="true"]',
      '[data-qa="texty_input"][data-input-metric-boundary="composer"][contenteditable="true"]',
    ]

    for (const selector of selectors) {
      const locator = this.page.locator(selector).first()
      try {
        await locator.waitFor({ state: 'visible', timeout: 7000 })
        return locator
      } catch {
        // Try next selector.
      }
    }

    throw new Error('Could not locate Slack message composer for this conversation.')
  }

  private async waitForPosted(
    expectedText: string,
    previous: {
      previousTimestamp?: number
      previousKey?: string
    },
  ): Promise<SlackMessage> {
    const deadline = Date.now() + 15000

    while (Date.now() < deadline) {
      const latest = MessageManager.pickLatest(await this.readVisible(), 1)[0]
      if (!latest) {
        await this.page.waitForTimeout(450)
        continue
      }

      const isNewer =
        typeof latest.timestampUnix !== 'number' ||
        typeof previous.previousTimestamp !== 'number' ||
        latest.timestampUnix > previous.previousTimestamp + 0.000001

      const isDifferentEntry = !previous.previousKey || this.messageKey(latest) !== previous.previousKey
      const sameText = latest.text.trim() === expectedText.trim()

      if (isDifferentEntry && isNewer && sameText) {
        return latest
      }

      await this.page.waitForTimeout(450)
    }

    throw new Error('Message may not have been posted yet. Please verify in Slack and retry if needed.')
  }

  private messageKey(message: SlackMessage | undefined): string | undefined {
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
}
