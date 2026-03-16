import type { Locator } from "playwright";
import { SlackComponent } from "../slack-component.js";
import { BROWSER_HELPERS } from "../utils/browser-helpers.js";

export type SlackMessage = {
  user?: string;
  text: string;
  timestampLabel?: string;
  timestampUnix?: number;
  timestampIso?: string;
};

type SlackMessageSnapshot = SlackMessage & {
  channelId?: string;
  threadTs?: string;
  placeholder?: boolean;
  unprocessed?: boolean;
};

export type SlackMessageContext = {
  target?: SlackMessage;
  before: SlackMessage[];
  after: SlackMessage[];
  targetThreadTimestampUnix?: number;
};

type SlackSnapshotContext = {
  target?: SlackMessageSnapshot;
  before: SlackMessageSnapshot[];
  after: SlackMessageSnapshot[];
};

export class MessageManager extends SlackComponent {
  async readVisible(): Promise<SlackMessage[]> {
    const snapshots = await this.readVisibleSnapshots();
    return snapshots.map((message) => MessageManager.toSlackMessage(message));
  }

  async readContextAroundTimestamp(options: {
    targetTimestampUnix: number;
    before: number;
    after: number;
  }): Promise<SlackMessageContext> {
    const safeBefore = Math.max(0, options.before);
    const safeAfter = Math.max(0, options.after);
    const maxScrolls = Math.max(40, safeBefore + safeAfter + 10);

    const collected: SlackMessageSnapshot[] = [];
    let snapshotContext: SlackSnapshotContext = {
      before: [],
      after: [],
    };

    for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
      const visible = await this.readVisibleSnapshots();
      collected.push(...visible);

      snapshotContext = this.buildSnapshotContext(
        collected,
        options.targetTimestampUnix,
        safeBefore,
        safeAfter,
      );

      const hasEnoughBefore = snapshotContext.before.length >= safeBefore;
      const hasEnoughAfter = snapshotContext.after.length >= safeAfter;
      if (snapshotContext.target && hasEnoughBefore && hasEnoughAfter) {
        break;
      }

      if (attempt >= maxScrolls) {
        break;
      }

      if (!snapshotContext.target) {
        const direction = this.scrollDirectionForTimestamp(
          options.targetTimestampUnix,
          visible,
          attempt,
        );
        await this.scrollMessagePane(direction);
        continue;
      }

      if (!hasEnoughBefore) {
        await this.scrollMessagePane(-2200);
        continue;
      }

      if (!hasEnoughAfter) {
        await this.scrollMessagePane(2200);
      }
    }

    return {
      target: snapshotContext.target
        ? MessageManager.toSlackMessage(snapshotContext.target)
        : undefined,
      before: snapshotContext.before.map((message) => MessageManager.toSlackMessage(message)),
      after: snapshotContext.after.map((message) => MessageManager.toSlackMessage(message)),
      targetThreadTimestampUnix: MessageManager.parseTimestamp(snapshotContext.target?.threadTs),
    };
  }

  async readThreadVisible(options: {
    rootThreadTimestampUnix: number;
    limit: number;
  }): Promise<SlackMessage[]> {
    const safeLimit = Math.max(0, options.limit);
    if (safeLimit === 0) {
      return [];
    }

    const snapshots = await this.readAllSnapshots();
    const filtered = snapshots.filter((message) => {
      const threadTsUnix = MessageManager.parseTimestamp(message.threadTs);
      return (
        MessageManager.sameTimestamp(message.timestampUnix, options.rootThreadTimestampUnix) ||
        MessageManager.sameTimestamp(threadTsUnix, options.rootThreadTimestampUnix)
      );
    });

    const ordered = MessageManager.orderChronological(filtered).map((message) =>
      MessageManager.toSlackMessage(message),
    );

    return ordered.slice(-safeLimit);
  }

  private async readVisibleSnapshots(): Promise<SlackMessageSnapshot[]> {
    return this.readSnapshotsBySelector('[data-qa="message_pane"] [data-qa="message_container"]');
  }

  private async readAllSnapshots(): Promise<SlackMessageSnapshot[]> {
    return this.readSnapshotsBySelector('[data-qa="message_container"]');
  }

  private async readSnapshotsBySelector(selector: string): Promise<SlackMessageSnapshot[]> {
    return this.page.locator(selector).evaluateAll((nodes, helpers) => {
      const normalize = new Function(`return ${helpers.normalize}`)();
      const parseUnixSeconds = new Function(`return ${helpers.parseUnixSeconds}`)();

      const parsed: {
        user?: string;
        text: string;
        timestampLabel?: string;
        timestampUnix?: number;
        timestampIso?: string;
        channelId?: string;
        threadTs?: string;
        placeholder?: boolean;
        unprocessed?: boolean;
      }[] = [];
      let lastUser: string | undefined;

      for (const node of nodes) {
        const text =
          normalize(node.querySelector('[data-qa="message-text"]')?.textContent) ||
          normalize(node.querySelector(".c-message__body")?.textContent) ||
          normalize(node.textContent);

        if (!text) {
          continue;
        }

        const rawSender =
          normalize(node.querySelector('[data-qa="message_sender_name"]')?.textContent) ||
          normalize(node.querySelector('[data-qa*="-sender"]')?.textContent);

        const senderFromNode = rawSender ? rawSender.replace(/:$/, "").trim() : undefined;
        const user = senderFromNode || lastUser;
        if (senderFromNode) {
          lastUser = senderFromNode;
        }

        const timestampLabel =
          normalize(node.querySelector('[data-qa="timestamp_label"]')?.textContent) || undefined;

        const timestampUnix =
          parseUnixSeconds(node.getAttribute("data-msg-ts")) ||
          parseUnixSeconds(node.querySelector("[data-ts]")?.getAttribute("data-ts"));

        const timestampIso =
          typeof timestampUnix === "number"
            ? new Date(timestampUnix * 1000).toISOString()
            : undefined;

        const channelId = normalize(node.getAttribute("data-msg-channel-id")) || undefined;
        const threadTs = normalize(node.getAttribute("data-msg-thread-ts")) || undefined;
        const placeholder = node.getAttribute("data-qa-placeholder") === "true";
        const unprocessed = node.getAttribute("data-qa-unprocessed") === "true";

        parsed.push({
          user,
          text,
          timestampLabel,
          timestampUnix,
          timestampIso,
          channelId,
          threadTs,
          placeholder,
          unprocessed,
        });
      }

      return parsed;
    }, BROWSER_HELPERS);
  }

  async post(text: string): Promise<SlackMessage> {
    await this.ensureLatestVisible();

    const before = MessageManager.pickLatest(await this.readVisibleSnapshots(), 10);
    const previousKeys = new Set(
      before
        .map((message) => this.messageKey(message))
        .filter((key): key is string => Boolean(key)),
    );
    const sentAtUnix = Date.now() / 1000;
    const expectedConversationId = this.currentConversationId();

    const composer = await this.locateComposer();
    await composer.click({ force: true });
    await composer.fill(text);
    await this.sendComposerMessage(composer);

    await this.ensureLatestVisible();

    const posted = await this.waitForPosted(text, {
      previousKeys,
      sentAtUnix,
      expectedConversationId,
    });

    return MessageManager.toSlackMessage(posted);
  }

  static pickLatest<T extends SlackMessage>(messages: T[], limit: number): T[] {
    const safeLimit = Math.max(0, limit);
    if (safeLimit === 0) {
      return [];
    }

    const ordered = MessageManager.orderChronological(messages);
    const latest = ordered.slice(-safeLimit);
    return latest.reverse();
  }

  private static orderChronological<T extends SlackMessage>(messages: T[]): T[] {
    const deduped = MessageManager.dedupe(messages);
    return deduped
      .map((message, index) => ({ message, index }))
      .sort((left, right) => {
        const leftTs = left.message.timestampUnix;
        const rightTs = right.message.timestampUnix;

        if (typeof leftTs === "number" && typeof rightTs === "number" && leftTs !== rightTs) {
          return leftTs - rightTs;
        }

        if (typeof leftTs === "number" && typeof rightTs !== "number") {
          return 1;
        }

        if (typeof leftTs !== "number" && typeof rightTs === "number") {
          return -1;
        }

        return left.index - right.index;
      })
      .map(({ message }) => message);
  }

  private scrollDirectionForTimestamp(
    targetTimestampUnix: number,
    visible: SlackMessageSnapshot[],
    attempt: number,
  ): number {
    const range = this.visibleTimestampRange(visible);
    if (!range) {
      return attempt % 2 === 0 ? -2200 : 2200;
    }

    if (targetTimestampUnix < range.oldest) {
      return -2600;
    }

    if (targetTimestampUnix > range.newest) {
      return 2600;
    }

    return attempt % 2 === 0 ? -1200 : 1200;
  }

  private visibleTimestampRange(
    messages: SlackMessageSnapshot[],
  ): { oldest: number; newest: number } | undefined {
    const timestamps = messages
      .map((message) => message.timestampUnix)
      .filter((timestamp): timestamp is number => typeof timestamp === "number");

    if (timestamps.length === 0) {
      return undefined;
    }

    return {
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
    };
  }

  private buildSnapshotContext(
    messages: SlackMessageSnapshot[],
    targetTimestampUnix: number,
    before: number,
    after: number,
  ): SlackSnapshotContext {
    const ordered = MessageManager.orderChronological(messages);
    const targetIndex = this.findTargetMessageIndex(ordered, targetTimestampUnix);

    if (targetIndex === -1) {
      return {
        before: [],
        after: [],
      };
    }

    const fromIndex = Math.max(0, targetIndex - before);
    const toIndex = targetIndex + after + 1;

    return {
      target: ordered[targetIndex],
      before: ordered.slice(fromIndex, targetIndex),
      after: ordered.slice(targetIndex + 1, toIndex),
    };
  }

  private findTargetMessageIndex(
    messages: SlackMessageSnapshot[],
    targetTimestampUnix: number,
  ): number {
    const targetMicros = Math.round(targetTimestampUnix * 1_000_000);
    let closestIndex = -1;
    let closestDelta = Number.POSITIVE_INFINITY;

    for (let index = 0; index < messages.length; index += 1) {
      const currentTs = messages[index].timestampUnix;
      if (typeof currentTs !== "number") {
        continue;
      }

      const currentMicros = Math.round(currentTs * 1_000_000);
      const microDelta = Math.abs(currentMicros - targetMicros);
      if (microDelta <= 2) {
        return index;
      }

      const deltaSeconds = Math.abs(currentTs - targetTimestampUnix);
      if (deltaSeconds < closestDelta) {
        closestDelta = deltaSeconds;
        closestIndex = index;
      }
    }

    if (closestDelta <= 1) {
      return closestIndex;
    }

    return -1;
  }

  private static sameTimestamp(left: number | undefined, right: number): boolean {
    if (typeof left !== "number") {
      return false;
    }

    const leftMicros = Math.round(left * 1_000_000);
    const rightMicros = Math.round(right * 1_000_000);
    return Math.abs(leftMicros - rightMicros) <= 2;
  }

  private static parseTimestamp(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private static dedupe<T extends SlackMessage>(messages: T[]): T[] {
    const seen = new Set<string>();
    const deduped: T[] = [];

    for (const message of messages) {
      const key = [
        message.user ?? "",
        typeof message.timestampUnix === "number"
          ? message.timestampUnix.toString()
          : (message.timestampLabel ?? ""),
        message.text,
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(message);
    }

    return deduped;
  }

  private static toSlackMessage(message: SlackMessageSnapshot): SlackMessage {
    return {
      user: message.user,
      text: message.text,
      timestampLabel: message.timestampLabel,
      timestampUnix: message.timestampUnix,
      timestampIso: message.timestampIso,
    };
  }

  private async sendComposerMessage(composer: Locator): Promise<void> {
    const scopedSendButton = composer
      .locator('xpath=ancestor::*[@data-qa="message_input"][1]')
      .locator('[data-qa="texty_send_button"]')
      .first();
    const hasScopedSendButton = (await scopedSendButton.count()) > 0;
    const sendButton = hasScopedSendButton
      ? scopedSendButton
      : this.page.locator('[data-qa="texty_send_button"]').first();
    const hasSendButton = (await sendButton.count()) > 0;

    if (hasSendButton) {
      await sendButton.waitFor({ state: "visible", timeout: 6000 });

      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const [isDisabled, ariaDisabled] = await Promise.all([
          sendButton.isDisabled().catch(() => false),
          sendButton.getAttribute("aria-disabled"),
        ]);

        if (!isDisabled && ariaDisabled !== "true") {
          await sendButton.click({ force: true });
          return;
        }

        await this.page.waitForTimeout(120);
      }
    }

    // Fallback for workspaces where send button is hidden.
    await composer.press("Enter");
  }

  private async locateComposer(): Promise<Locator> {
    const scopedComposer = await this.pickWidestVisibleComposer(
      '[data-qa="message_input"] [data-qa="texty_input"][contenteditable="true"]',
      7000,
    );

    if (scopedComposer) {
      return scopedComposer;
    }

    const selectors = [
      '[data-qa="texty_input"][data-input-metric-boundary="composer"][contenteditable="true"]',
    ];

    for (const selector of selectors) {
      const locator = await this.pickWidestVisibleComposer(selector, 2500);
      if (locator) {
        return locator;
      }
    }

    throw new Error("Could not locate Slack message composer for this conversation.");
  }

  private async pickWidestVisibleComposer(
    selector: string,
    waitTimeoutMs: number,
  ): Promise<Locator | undefined> {
    const candidates = this.page.locator(selector);
    await candidates
      .first()
      .waitFor({ state: "visible", timeout: waitTimeoutMs })
      .catch(() => undefined);

    const count = await candidates.count();
    let bestIndex = -1;
    let bestWidth = -1;

    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      const isVisible = await candidate.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }

      const box = await candidate.boundingBox();
      const width = box?.width ?? 0;

      if (width > bestWidth) {
        bestWidth = width;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      return undefined;
    }

    return candidates.nth(bestIndex);
  }

  private async waitForPosted(
    expectedText: string,
    previous: {
      previousKeys: Set<string>;
      sentAtUnix: number;
      expectedConversationId?: string;
    },
  ): Promise<SlackMessageSnapshot> {
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
      const latestMessages = MessageManager.pickLatest(await this.readVisibleSnapshots(), 8);
      if (latestMessages.length === 0) {
        await this.ensureLatestVisible();
        await this.page.waitForTimeout(450);
        continue;
      }

      for (const latest of latestMessages) {
        const key = this.messageKey(latest);
        if (!key || previous.previousKeys.has(key)) {
          continue;
        }

        const sameText = latest.text.trim() === expectedText.trim();
        if (!sameText) {
          continue;
        }

        const isExpectedChannel =
          !previous.expectedConversationId ||
          !latest.channelId ||
          latest.channelId === previous.expectedConversationId;
        if (!isExpectedChannel) {
          continue;
        }

        if (latest.threadTs) {
          continue;
        }

        const isFreshEnough =
          typeof latest.timestampUnix !== "number" ||
          latest.timestampUnix + 1 >= previous.sentAtUnix;

        const isProcessed = !latest.placeholder && !latest.unprocessed;

        if (!isFreshEnough || !isProcessed) {
          continue;
        }

        await this.page.waitForTimeout(650);
        const confirmation = MessageManager.pickLatest(await this.readVisibleSnapshots(), 12);
        const confirmationKey = this.messageKey(latest);
        const stillVisible = confirmation.some((message) => {
          const key = this.messageKey(message);
          return key === confirmationKey && !message.placeholder && !message.unprocessed;
        });

        if (stillVisible) {
          return latest;
        }
      }

      await this.ensureLatestVisible();
      await this.page.waitForTimeout(450);
    }

    throw new Error(
      "Message may not have been posted yet. Please verify in Slack and retry if needed.",
    );
  }

  private messageKey(message: SlackMessage | undefined): string | undefined {
    if (!message) {
      return undefined;
    }

    return [
      message.user ?? "",
      message.timestampUnix?.toString() ?? "",
      message.timestampLabel ?? "",
      message.text,
    ].join("|");
  }

  private currentConversationId(): string | undefined {
    const pathMatch = this.page.url().match(/\/client\/[^/]+\/([^/?]+)/);
    return pathMatch?.[1];
  }

  private async scrollMessagePane(deltaY: number): Promise<void> {
    const messagePane = this.page.locator('[data-qa="message_pane"]').first();
    const isVisible = await messagePane.isVisible().catch(() => false);
    if (!isVisible) {
      return;
    }

    await messagePane.click({ force: true }).catch(() => undefined);
    await this.page.mouse.wheel(0, deltaY);
    await this.page.waitForTimeout(220);
  }

  private async ensureLatestVisible(): Promise<void> {
    const messagePane = this.page.locator('[data-qa="message_pane"]').first();
    const isVisible = await messagePane.isVisible().catch(() => false);
    if (!isVisible) {
      return;
    }

    await messagePane.click({ force: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.page.mouse.wheel(0, 7000);
      await this.page.keyboard.press("End").catch(() => undefined);
      await this.page.waitForTimeout(120);
    }
  }
}
