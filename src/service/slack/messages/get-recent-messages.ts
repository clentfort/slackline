import type { SlackConversation } from "../conversation/conversation-manager.js";
import { type SlackMessage, MessageManager } from "./message-manager.js";
import { type SlackPermalink, buildSlackThreadUrl, parseSlackPermalink } from "./permalink.js";
import { withSlackClient } from "../with-slack-client.js";

type GetRecentMessagesOptions = {
  target: string;
  limit: number;
  before?: number;
  after?: number;
  includeThread?: boolean;
  threadLimit?: number;
};

export type SlackFocusedMessages = {
  targetFound: boolean;
  targetMessage?: SlackMessage;
  before: SlackMessage[];
  after: SlackMessage[];
  threadMessages?: SlackMessage[];
};

export type SlackRecentMessagesResult = {
  target: string;
  conversation: SlackConversation;
  messages: SlackMessage[];
  permalink?: SlackPermalink;
  focused?: SlackFocusedMessages;
};

export async function getRecentMessages(
  options: GetRecentMessagesOptions,
): Promise<SlackRecentMessagesResult> {
  return withSlackClient({}, async (client) => {
    const permalink = parseSlackPermalink(options.target);
    if (!permalink) {
      const conversation = await client.conversations.open({ target: options.target });

      await client.page.waitForTimeout(500);
      const visible = await client.messages.readVisible();

      return {
        target: options.target,
        conversation,
        messages: MessageManager.pickLatest(visible, options.limit),
      };
    }

    const conversation = await client.conversations.open({ target: permalink.channelId });

    const messageUrl = buildSlackMessageUrl(permalink, client.page.url());

    await client.page.goto(messageUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await client.page
      .locator('[data-qa="message_pane"]')
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => undefined);
    await client.page.waitForLoadState("networkidle").catch(() => undefined);
    await client.page.waitForTimeout(1200);

    const focused = await client.messages.readContextAroundTimestamp({
      targetTimestampUnix: permalink.messageTimestampUnix,
      before: options.before ?? 0,
      after: options.after ?? 0,
    });

    const contextualMessages = [
      ...focused.before,
      ...(focused.target ? [focused.target] : []),
      ...focused.after,
    ];

    const fallbackVisible =
      contextualMessages.length === 0
        ? MessageManager.pickLatest(await client.messages.readVisible(), options.limit)
        : [];

    const focusedResult: SlackFocusedMessages = {
      targetFound: Boolean(focused.target),
      targetMessage: focused.target,
      before: focused.before,
      after: focused.after,
    };

    if (options.includeThread) {
      const rootThreadTimestampUnix =
        permalink.threadTimestampUnix ??
        focused.targetThreadTimestampUnix ??
        permalink.messageTimestampUnix;

      const threadUrl = buildSlackThreadUrl({
        permalinkUrl: messageUrl,
        channelId: permalink.channelId,
        threadTimestampUnix: rootThreadTimestampUnix,
      });

      await client.page.goto(threadUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await client.page.waitForTimeout(800);

      focusedResult.threadMessages = await client.messages.readThreadVisible({
        rootThreadTimestampUnix,
        limit: options.threadLimit ?? options.limit,
      });
    }

    return {
      target: options.target,
      conversation,
      permalink,
      focused: focusedResult,
      messages: contextualMessages.length > 0 ? contextualMessages : fallbackVisible,
    };
  });
}

function buildSlackMessageUrl(permalink: SlackPermalink, currentPageUrl: string): string {
  const packedTimestamp = packSlackTimestamp(permalink.messageTimestampRaw);

  try {
    const current = new URL(currentPageUrl);
    const url = new URL(`/messages/${permalink.channelId}/p${packedTimestamp}`, current.origin);
    return url.toString();
  } catch {
    return `https://${permalink.workspaceHost}/messages/${permalink.channelId}/p${packedTimestamp}`;
  }
}

function packSlackTimestamp(timestampRaw: string): string {
  const [secondsRaw, microsRaw = ""] = timestampRaw.split(".");
  const seconds = secondsRaw.replace(/\D/g, "").slice(0, 10);
  const micros = microsRaw.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
  return `${seconds}${micros}`;
}
