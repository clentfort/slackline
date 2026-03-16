import {
  conversationTypeFromId,
  normalizeConversationAlias,
  normalizeConversationId,
} from "./conversation-identity.js";
import {
  rememberKnownConversation,
  rememberKnownConversations,
  resolveKnownConversationId,
  workspaceKeyFromUrl,
} from "../identity/conversation-map-store.js";
import { SlackComponent } from "../slack-component.js";
import { BROWSER_HELPERS } from "../utils/browser-helpers.js";
import { escapeRegExp } from "../utils/text.js";

export type SlackConversation = {
  type: "channel" | "dm" | "unknown";
  id?: string;
  name?: string;
  url: string;
};

export class ConversationManager extends SlackComponent {
  /**
   * Opens a conversation by name or ID.
   * @param options.target Channel/DM name (e.g. 'general', '@jules') or Slack ID (e.g. 'C12345').
   */
  async open(options: { target: string }): Promise<SlackConversation> {
    const target = this.normalizeTarget(options.target);
    const workspaceKey = workspaceKeyFromUrl(this.page.url());

    if (target) {
      await this.page
        .waitForFunction(
          () => document.querySelectorAll('[data-qa^="channel_sidebar_name_"]').length > 0,
          {
            timeout: 12000,
          },
        )
        .catch(() => {});

      if (workspaceKey) {
        await this.rememberVisibleConversations(workspaceKey);
      }

      const opened = await this.openTarget(target, workspaceKey);
      if (!opened) {
        throw new Error(
          `Could not find Slack channel or DM: ${target}. It is not visible in the sidebar and no known ID mapping was found.`,
        );
      }
    }

    await this.page.waitForTimeout(900);
    await this.page
      .locator('[data-qa="message_pane"], [data-qa="message_input"]')
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    const active = await this.readActive();
    const activeWorkspaceKey = workspaceKey ?? workspaceKeyFromUrl(active.url);

    if (activeWorkspaceKey && active.id) {
      rememberKnownConversation({
        workspaceKey: activeWorkspaceKey,
        id: active.id,
        name: active.name,
        type: active.type,
        aliases: target ? [target] : [],
      });
    }

    return active;
  }

  async readActive(): Promise<SlackConversation> {
    const details = await this.page.evaluate((helpers) => {
      const normalize = new Function(`return ${helpers.normalize}`)();

      const url = window.location.href;
      const pathMatch = window.location.pathname.match(/\/client\/[^/]+\/([^/?]+)/);
      const id = pathMatch?.[1];

      const nameFromHeader =
        normalize(document.querySelector('[data-qa="channel_name"]')?.textContent) ??
        normalize(document.querySelector('[data-qa="channel_name_button"]')?.textContent);

      const inputLabel = normalize(
        document
          .querySelector('[data-qa="message_input"] [data-qa="texty_input"]')
          ?.getAttribute("aria-label"),
      );

      const fromInput = inputLabel
        ?.replace(/^nachricht an\s+/i, "")
        ?.replace(/^message\s+to\s+/i, "")
        ?.trim();

      return {
        id,
        url,
        name: nameFromHeader ?? normalize(fromInput),
      };
    }, BROWSER_HELPERS);

    const type = conversationTypeFromId(details.id);

    return {
      type,
      id: details.id,
      name: details.name,
      url: details.url,
    };
  }

  private async openTarget(target: string, workspaceKey: string | undefined): Promise<boolean> {
    const directId = normalizeConversationId(target);
    if (directId) {
      return this.openByConversationId(directId);
    }

    const clicked = await this.clickSidebarConversation(target);
    if (clicked) {
      return true;
    }

    if (workspaceKey) {
      const knownId = resolveKnownConversationId({ workspaceKey, target });
      if (knownId) {
        return this.openByConversationId(knownId);
      }
    }

    return false;
  }

  private async openByConversationId(conversationId: string): Promise<boolean> {
    const targetUrl = this.buildConversationUrl(conversationId);
    if (!targetUrl) {
      return false;
    }

    await this.page.goto(targetUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    return this.waitForConversationUrl(conversationId, 10000);
  }

  private buildConversationUrl(conversationId: string): string | null {
    try {
      const current = new URL(this.page.url());
      const teamId = current.pathname.match(/\/client\/([^/]+)/)?.[1];
      if (!teamId) {
        return null;
      }

      return `${current.origin}/client/${teamId}/${conversationId}`;
    } catch {
      return null;
    }
  }

  private async waitForConversationUrl(
    conversationId: string,
    timeoutMs: number,
  ): Promise<boolean> {
    const escaped = escapeRegExp(conversationId);
    const pattern = new RegExp(`/client/[^/]+/${escaped}(?:[/?#]|$)`, "i");

    if (pattern.test(this.page.url())) {
      return true;
    }

    try {
      await this.page.waitForURL(pattern, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  private async clickSidebarConversation(target: string): Promise<boolean> {
    const normalizedTarget = normalizeConversationAlias(target);
    if (!normalizedTarget) {
      return false;
    }

    const selectors = [
      `[data-qa="channel_sidebar_name_${normalizedTarget}"]`,
      '[data-qa^="channel_sidebar_name_"]',
    ];

    const escaped = escapeRegExp(normalizedTarget);
    const exactPattern = new RegExp(`^${escaped}$`, "i");

    for (const selector of selectors) {
      const exactMatch = this.page.locator(selector).filter({ hasText: exactPattern }).first();
      if ((await exactMatch.count()) > 0) {
        await exactMatch.click({ force: true });
        return true;
      }

      const partialMatch = this.page
        .locator(selector)
        .filter({ hasText: normalizedTarget })
        .first();
      if ((await partialMatch.count()) > 0) {
        await partialMatch.click({ force: true });
        return true;
      }
    }

    return false;
  }

  private async rememberVisibleConversations(workspaceKey: string): Promise<void> {
    const entries = await this.page
      .evaluate(() => {
        const normalize = (value: string | null | undefined): string => {
          return (value || "").replace(/\s+/g, " ").trim();
        };

        const parsed: Array<{ id: string; name: string }> = [];
        const seen = new Set<string>();

        const add = (id: string | null | undefined, name: string | null | undefined): void => {
          const normalizedId = normalize(id).toUpperCase();
          const normalizedName = normalize(name);
          if (!normalizedId || !normalizedName) {
            return;
          }

          if (!/^[CDG][A-Z0-9]{8,}$/.test(normalizedId) || !/\d/.test(normalizedId.slice(1))) {
            return;
          }

          const key = `${normalizedId}|${normalizedName}`;
          if (seen.has(key)) {
            return;
          }

          seen.add(key);
          parsed.push({ id: normalizedId, name: normalizedName });
        };

        for (const label of document.querySelectorAll<HTMLElement>(
          '[data-qa^="channel_sidebar_name_"]',
        )) {
          const anchor = label.closest<HTMLAnchorElement>('a[href*="/client/"]');
          const href = anchor?.getAttribute("href") || "";
          const id = href.match(/\/client\/[^/]+\/([^/?]+)/)?.[1] || null;
          add(id, label.textContent);
        }

        const activeId = window.location.pathname.match(/\/client\/[^/]+\/([^/?]+)/)?.[1] || null;
        const activeName =
          normalize(document.querySelector('[data-qa="channel_name"]')?.textContent) ||
          normalize(document.querySelector('[data-qa="channel_name_button"]')?.textContent) ||
          null;

        add(activeId, activeName);

        return parsed;
      })
      .catch(() => [] as Array<{ id: string; name: string }>);

    rememberKnownConversations({
      workspaceKey,
      entries: entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: conversationTypeFromId(entry.id),
      })),
    });
  }

  private normalizeTarget(target: string | undefined): string {
    return (target ?? "").trim();
  }
}
