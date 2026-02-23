import type { Page } from 'playwright'

export type SlackConversation = {
  type: 'channel' | 'dm' | 'unknown'
  id?: string
  name?: string
  url: string
}

export async function openConversation(page: Page, options: { workspaceUrl: string; target?: string }): Promise<SlackConversation> {
  const target = normalizeTarget(options.target)
  const targetUrl = isAbsoluteUrl(target) ? target : options.workspaceUrl

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

  if (target && !isAbsoluteUrl(target)) {
    await page
      .waitForFunction(() => document.querySelectorAll('[data-qa^="channel_sidebar_name_"]').length > 0, {
        timeout: 12000,
      })
      .catch(() => {})

    const clicked = await clickSidebarConversation(page, target)
    if (!clicked) {
      throw new Error(`Could not find Slack channel or DM in sidebar: ${target}`)
    }
  }

  await page.waitForTimeout(900)
  await page
    .locator('[data-qa="message_pane"], [data-qa="message_input"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })

  return readActiveConversation(page)
}

async function clickSidebarConversation(page: Page, target: string): Promise<boolean> {
  const normalizedTarget = target.replace(/^[@#]/, '').trim()
  if (!normalizedTarget) {
    return false
  }

  const selectors = [
    `[data-qa="channel_sidebar_name_${normalizedTarget}"]`,
    '[data-qa^="channel_sidebar_name_"]',
  ]

  const escaped = escapeRegExp(normalizedTarget)
  const exactPattern = new RegExp(`^${escaped}$`, 'i')

  for (const selector of selectors) {
    const exactMatch = page.locator(selector).filter({ hasText: exactPattern }).first()
    if ((await exactMatch.count()) > 0) {
      await exactMatch.click({ force: true })
      return true
    }

    const partialMatch = page.locator(selector).filter({ hasText: normalizedTarget }).first()
    if ((await partialMatch.count()) > 0) {
      await partialMatch.click({ force: true })
      return true
    }
  }

  return false
}

async function readActiveConversation(page: Page): Promise<SlackConversation> {
  const details = await page.evaluate(() => {
    const normalize = (value: string | null | undefined): string | undefined => {
      const cleaned = (value ?? '').replace(/\s+/g, ' ').trim()
      return cleaned.length > 0 ? cleaned : undefined
    }

    const url = window.location.href
    const pathMatch = window.location.pathname.match(/\/client\/[^/]+\/([^/?]+)/)
    const id = pathMatch?.[1]

    const nameFromHeader =
      normalize(document.querySelector('[data-qa="channel_name"]')?.textContent) ??
      normalize(document.querySelector('[data-qa="channel_name_button"]')?.textContent)

    const inputLabel = normalize(
      document.querySelector('[data-qa="message_input"] [data-qa="texty_input"]')?.getAttribute('aria-label'),
    )

    const fromInput = inputLabel
      ?.replace(/^nachricht an\s+/i, '')
      ?.replace(/^message\s+to\s+/i, '')
      ?.trim()

    return {
      id,
      url,
      name: nameFromHeader ?? normalize(fromInput),
    }
  })

  const type =
    details.id?.startsWith('D')
      ? 'dm'
      : details.id?.startsWith('C') || details.id?.startsWith('G')
        ? 'channel'
        : 'unknown'

  return {
    type,
    id: details.id,
    name: details.name,
    url: details.url,
  }
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function normalizeTarget(target: string | undefined): string {
  return (target ?? '').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
