import type { BrowserContext, Page } from "playwright";

import { normalize } from "../utils/text.js";

const loggedInSelectors = [
  'button[data-qa="top_nav_search"]',
  'button[data-qa="user-button"]',
  '[data-qa="team_sidebar_scroll_container"]',
];

export async function isLoggedInPage(page: Page, timeoutMs: number): Promise<boolean> {
  if (page.isClosed()) {
    return false;
  }

  if (!isSlackClientLikeUrl(page.url())) {
    return false;
  }

  for (const selector of loggedInSelectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: timeoutMs });

      // Slack can redirect to auth after initial paint in some sessions.
      await page.waitForTimeout(250);
      return isSlackClientLikeUrl(page.url());
    } catch {
      // Try next selector.
    }
  }

  return false;
}

export async function isLoggedInContext(
  context: BrowserContext,
  timeoutMs: number,
): Promise<boolean> {
  for (const page of context.pages()) {
    if (await isLoggedInPage(page, timeoutMs)) {
      return true;
    }
  }

  return false;
}

export function extractNameFromUserLabel(rawLabel: string | undefined): string | undefined {
  if (!rawLabel) {
    return undefined;
  }

  const normalized = normalize(rawLabel);
  const patterns = [
    /^user:\s*(.+)$/i,
    /^benutzer:in:\s*(.+)$/i,
    /^account:\s*(.+)$/i,
    /^profil:\s*(.+)$/i,
    /^profile:\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalize(match[1]);
    }
  }

  return normalized;
}

export function extractWorkspaceName(args: {
  title: string | undefined;
  searchButtonText: string | undefined;
  searchButtonAria: string | undefined;
}): string | undefined {
  const fromSearchText = parseWorkspaceFromSearchLabel(args.searchButtonText);
  if (fromSearchText) {
    return fromSearchText;
  }

  const fromSearchAria = parseWorkspaceFromSearchLabel(args.searchButtonAria);
  if (fromSearchAria) {
    return fromSearchAria;
  }

  return parseWorkspaceFromTitle(args.title);
}

function parseWorkspaceFromTitle(rawTitle: string | undefined): string | undefined {
  const title = normalize(rawTitle);
  if (!title) {
    return undefined;
  }

  const parts = title.split(" - ").map(normalize).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    if (candidate && candidate.toLowerCase() !== "slack") {
      return candidate;
    }
  }

  const withoutSuffix = title.replace(/\s*\|\s*slack\s*$/i, "").trim();
  if (withoutSuffix && withoutSuffix.toLowerCase() !== "slack") {
    return withoutSuffix;
  }

  return undefined;
}

function parseWorkspaceFromSearchLabel(raw: string | undefined): string | undefined {
  const label = normalize(raw);
  if (!label) {
    return undefined;
  }

  const german = label.match(/^(.+?)\s+durchsuchen$/i);
  if (german?.[1]) {
    return normalize(german[1]);
  }

  const english = label.match(/^search(?:\sin)?\s+(.+)$/i);
  if (english?.[1]) {
    return normalize(english[1]);
  }

  return undefined;
}

function isSlackClientUrl(url: string): boolean {
  return /\/client\//.test(url);
}

function isSlackClientLikeUrl(url: string): boolean {
  return isSlackClientUrl(url) && !isSlackAuthUrl(url);
}

function isSlackAuthUrl(url: string): boolean {
  return /workspace-signin|\/signin|\/auth(\?|\/|$)|\/login\//.test(url);
}
