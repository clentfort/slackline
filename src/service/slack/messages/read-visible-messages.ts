import type { Page } from 'playwright'

export type SlackMessage = {
  user?: string
  text: string
  timestampLabel?: string
  timestampUnix?: number
  timestampIso?: string
}

export async function readVisibleMessages(page: Page): Promise<SlackMessage[]> {
  return page.locator('[data-qa="message_container"]').evaluateAll((nodes) => {
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

export function pickLatestMessages(messages: SlackMessage[], limit: number): SlackMessage[] {
  const deduped = dedupeMessages(messages)
  const safeLimit = Math.max(0, limit)
  const latest = deduped.slice(-safeLimit)
  return latest.reverse()
}

function dedupeMessages(messages: SlackMessage[]): SlackMessage[] {
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
