import { withSlackContext } from '../../playwright/playwright-client.js'
import type { SlackBrowserOptions } from '../../playwright/playwright-client.js'
import { isLoggedInPage } from '../session/session-state.js'

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

type SearchSlackOptions = {
  workspaceUrl: string
  query: string
  limit: number
  browser?: SlackBrowserOptions
}

export async function searchSlack(options: SearchSlackOptions): Promise<SlackSearchResult> {
  return withSlackContext({
    headless: true,
    ...options.browser,
  }, async ({ page }) => {
    await page.goto(options.workspaceUrl, { waitUntil: 'domcontentloaded' })

    const loggedIn = await isLoggedInPage(page, 15000)
    if (!loggedIn) {
      throw new Error('Not logged in to Slack. Run `slackline auth login` first.')
    }

    const searchField = await openSearchField(page)
    await searchField.click({ force: true })
    await searchField.fill(options.query)
    await submitSearch(page, searchField, options.query)

    await page.waitForTimeout(2500)
    await page.locator('[data-qa="search_result"]').first().waitFor({ state: 'visible', timeout: 7000 }).catch(() => {})

    const records = await page
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
        const items: {
          user?: string
          channel?: string
          message: string
          timestampLabel?: string
          timestampUnix?: number
          timestampIso?: string
          rawText: string
        }[] = []

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
      }, options.query)

    return {
      query: options.query,
      results: records.slice(0, Math.max(0, options.limit)),
    }
  })
}

async function openSearchField(page: import('playwright').Page): Promise<import('playwright').Locator> {
  const searchButton = page.locator('button[data-qa="top_nav_search"]').first()
  await searchButton.waitFor({ state: 'visible', timeout: 15000 })

  await clearTopSearchQuery(page)

  await searchButton.click({ force: true }).catch(() => {})
  const fromClick = await findSearchField(page, 3500)
  if (fromClick) {
    return fromClick
  }

  await searchButton.focus().catch(() => {})
  await searchButton.press('Enter').catch(() => {})
  const fromEnter = await findSearchField(page, 2500)
  if (fromEnter) {
    return fromEnter
  }

  const openSearchShortcut = process.platform === 'darwin' ? 'Meta+K' : 'Control+K'
  await page.keyboard.press(openSearchShortcut).catch(() => {})
  const fromShortcut = await findSearchField(page, 2500)
  if (fromShortcut) {
    return fromShortcut
  }

  throw new Error('Could not locate Slack search field. Slack UI may have changed.')
}

async function clearTopSearchQuery(page: import('playwright').Page): Promise<void> {
  const clearButton = page.locator('[data-qa="top_nav_search_clear"]').first()

  if ((await clearButton.count()) === 0) {
    return
  }

  const visible = await clearButton.isVisible().catch(() => false)
  if (!visible) {
    return
  }

  await clearButton.click({ force: true }).catch(() => {})
  await page.waitForTimeout(350)
}

async function findSearchField(
  page: import('playwright').Page,
  timeoutMs: number,
): Promise<import('playwright').Locator | null> {
  const selectors = [
    '[data-qa="search_input_box"] [data-qa="texty_input"][contenteditable="true"]',
    '[data-qa="focusable_search_input"] [data-qa="texty_input"][contenteditable="true"]',
  ]

  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs })
      return locator
    } catch {
      // Try next selector.
    }
  }

  return null
}

async function submitSearch(
  page: import('playwright').Page,
  searchField: import('playwright').Locator,
  query: string,
): Promise<void> {
  await searchField.press('Enter')

  if (await waitForSearchUrl(page, 3000)) {
    return
  }

  const queryOption = page.locator('[data-qa="search-query-entity-text-content"]').filter({ hasText: query }).first()
  try {
    await queryOption.waitFor({ state: 'visible', timeout: 2500 })
    await queryOption.click({ force: true })
  } catch {
    await searchField.press('Enter')
  }

  if (!(await waitForSearchUrl(page, 3000))) {
    await page.waitForURL('**/search**', { timeout: 30000 })
  }
}

async function waitForSearchUrl(page: import('playwright').Page, timeoutMs: number): Promise<boolean> {
  if (page.url().includes('/search')) {
    return true
  }

  try {
    await page.waitForURL('**/search**', { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}
