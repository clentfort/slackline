import type { Locator } from 'playwright'
import { SlackComponent } from '../slack-client.js'

export type SlackSearchItem = {
  user?: string
  channel?: string
  message: string
  timestampLabel?: string
  timestampUnix?: number
  timestampIso?: string
  rawText: string
}

export type SlackSearchResult = {
  query: string
  results: SlackSearchItem[]
}

export class SearchManager extends SlackComponent {
  async search(query: string, limit: number): Promise<SlackSearchResult> {
    const searchField = await this.openSearchField()
    await searchField.click({ force: true })
    await searchField.fill(query)
    await this.submitSearch(searchField, query)

    await this.page.waitForTimeout(2500)
    await this.page.locator('[data-qa="search_result"]').first().waitFor({ state: 'visible', timeout: 7000 }).catch(() => {})

    const records = await this.page
      .locator('[data-qa="search_result"]')
      .evaluateAll((nodes, query) => {
        const normalize = (value: string | null | undefined): string =>
          (value ?? '').replace(/\s+/g, ' ').trim()

        const parseUnixSeconds = (value: string | null | undefined): number | undefined => {
          const numeric = Number.parseFloat((value ?? '').trim())
          return Number.isFinite(numeric) ? numeric : undefined
        }

        const queryLower = query.toLowerCase()
        const seen = new Set<string>()
        const items: any[] = []

        for (const node of nodes) {
          const rawText = normalize(node.textContent)
          if (!rawText) {
            continue
          }

          const user = normalize(node.querySelector('[data-qa="message_sender_name"]')?.textContent) || undefined

          const channelInNode = normalize(
            node.querySelector('[data-qa="search_result_channel_name"]')?.textContent,
          )
          const sibling = node.nextElementSibling
          const channelInSibling =
            sibling?.getAttribute('data-qa') === 'search_result_channel_name'
              ? normalize(sibling.textContent)
              : ''

          const channel = channelInNode || channelInSibling

          const timestampNode = node.querySelector('[data-qa="timestamp_label"]')
          const timestampLabel = normalize(timestampNode?.textContent) || undefined
          const timestampAnchor = timestampNode?.closest('[data-ts]')
          const timestampUnix = parseUnixSeconds(timestampAnchor?.getAttribute('data-ts'))
          const timestampIso =
            typeof timestampUnix === 'number' ? new Date(timestampUnix * 1000).toISOString() : undefined

          const message =
            normalize(node.querySelector('[data-qa="message-text"]')?.textContent) ||
            normalize(node.querySelector('.c-message__body')?.textContent) ||
            rawText

          const messageMatchesQuery =
            rawText.toLowerCase().includes(queryLower) || message.toLowerCase().includes(queryLower)

          const dedupeKey = [user ?? '', channel ?? '', timestampLabel ?? '', message].join('|')
          if (!messageMatchesQuery || seen.has(dedupeKey)) {
            continue
          }

          seen.add(dedupeKey)
          items.push({
            user,
            channel: channel || undefined,
            message,
            timestampLabel,
            timestampUnix,
            timestampIso,
            rawText,
          })
        }

        return items
      }, query)

    return {
      query: query,
      results: records.slice(0, Math.max(0, limit)),
    }
  }

  private async openSearchField(): Promise<Locator> {
    const searchButton = this.page.locator('button[data-qa="top_nav_search"]').first()
    await searchButton.waitFor({ state: 'visible', timeout: 15000 })

    await this.clearTopSearchQuery()

    await searchButton.click({ force: true }).catch(() => {})
    const fromClick = await this.findSearchField(3500)
    if (fromClick) {
      return fromClick
    }

    await searchButton.focus().catch(() => {})
    await searchButton.press('Enter').catch(() => {})
    const fromEnter = await this.findSearchField(2500)
    if (fromEnter) {
      return fromEnter
    }

    const openSearchShortcut = process.platform === 'darwin' ? 'Meta+K' : 'Control+K'
    await this.page.keyboard.press(openSearchShortcut).catch(() => {})
    const fromShortcut = await this.findSearchField(2500)
    if (fromShortcut) {
      return fromShortcut
    }

    throw new Error('Could not locate Slack search field. Slack UI may have changed.')
  }

  private async clearTopSearchQuery(): Promise<void> {
    const clearButton = this.page.locator('[data-qa="top_nav_search_clear"]').first()

    if ((await clearButton.count()) === 0) {
      return
    }

    const visible = await clearButton.isVisible().catch(() => false)
    if (!visible) {
      return
    }

    await clearButton.click({ force: true }).catch(() => {})
    await this.page.waitForTimeout(350)
  }

  private async findSearchField(timeoutMs: number): Promise<Locator | null> {
    const selectors = [
      '[data-qa="search_input_box"] [data-qa="texty_input"][contenteditable="true"]',
      '[data-qa="focusable_search_input"] [data-qa="texty_input"][contenteditable="true"]',
    ]

    for (const selector of selectors) {
      const locator = this.page.locator(selector).first()
      try {
        await locator.waitFor({ state: 'visible', timeout: timeoutMs })
        return locator
      } catch {
        // Try next selector.
      }
    }

    return null
  }

  private async submitSearch(
    searchField: Locator,
    query: string,
  ): Promise<void> {
    await searchField.press('Enter')

    if (await this.waitForSearchUrl(3000)) {
      return
    }

    const queryOption = this.page.locator('[data-qa="search-query-entity-text-content"]').filter({ hasText: query }).first()
    try {
      await queryOption.waitFor({ state: 'visible', timeout: 2500 })
      await queryOption.click({ force: true })
    } catch {
      await searchField.press('Enter')
    }

    if (!(await this.waitForSearchUrl(3000))) {
      await this.page.waitForURL('**/search**', { timeout: 30000 })
    }
  }

  private async waitForSearchUrl(timeoutMs: number): Promise<boolean> {
    if (this.page.url().includes('/search')) {
      return true
    }

    try {
      await this.page.waitForURL('**/search**', { timeout: timeoutMs })
      return true
    } catch {
      return false
    }
  }
}
