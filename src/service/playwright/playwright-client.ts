import { chromium, type BrowserContext, type Page } from "playwright";

import { startSlackDaemon, getSlackDaemonStatus } from "./daemon-manager.js";

export type SlackBrowserOptions = {
  cdpUrl?: string;
  chromePath?: string;
};

type WithSlackContextOptions = SlackBrowserOptions & {
  headless: boolean;
  keepContextOpen?: boolean;
};

export async function withSlackContext<T>(
  options: WithSlackContextOptions,
  callback: (value: { context: BrowserContext; page: Page }) => Promise<T>,
): Promise<T> {
  const currentStatus = await getSlackDaemonStatus({ cdpUrl: options.cdpUrl });
  const status = await startSlackDaemon({
    cdpUrl: options.cdpUrl ?? currentStatus.cdpUrl,
    headless: options.headless,
    chromePath: options.chromePath,
  });

  const connectedBrowser = await chromium.connectOverCDP(status.cdpUrl);
  const context = connectedBrowser.contexts()[0];
  if (!context) {
    throw new Error(`No browser context available at CDP endpoint ${status.cdpUrl}`);
  }

  const slackPage = context
    .pages()
    .find((page) => !page.isClosed() && /https?:\/\/app\.slack\.com\//i.test(page.url()));

  let page: Page;
  if (slackPage) {
    page = slackPage;
  } else {
    const existingPage = context.pages().find((page) => !page.isClosed());
    page = existingPage ?? (await context.newPage());
  }

  try {
    return await callback({ context, page });
  } finally {
    if (!options.keepContextOpen) {
      // We close the context but NOT the browser, to keep the daemon running.
      // The CDP connection will be dropped when the process exits.
      await context.close().catch(() => {});
    }
  }
}
