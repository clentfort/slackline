import { isDirectMessageChannel } from "../utils/text.js";
import type { WorkspaceContext } from "../identity/workspace-context.js";
import type { SlackWebSocketMessage, SlackEvent } from "../types.js";

const channelMentionPattern = /<!channel>|<!here>|<!everyone>/;

function textContainsMention(text: string, currentUserId: string | null): boolean {
  if (currentUserId && text.includes(`<@${currentUserId}>`)) {
    return true;
  }
  return channelMentionPattern.test(text);
}

function trimNotificationBody(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 300) {
    return trimmed;
  }
  return `${trimmed.slice(0, 297)}...`;
}

/**
 * Processes parsed Slack WebSocket messages and determines if they should trigger a notification.
 */
export class NotificationProcessor {
  private readonly seenMessageIds = new Set<string>();

  constructor(private readonly context: WorkspaceContext) {}

  /**
   * Processes a structured Slack message and returns a notification event if applicable.
   */
  async process(payload: SlackWebSocketMessage): Promise<SlackEvent | null> {
    const type = payload.type;
    if (type !== "message") {
      return null;
    }

    const subtype = payload.subtype;
    if (subtype && subtype !== "thread_broadcast") {
      return null;
    }

    if (payload.hidden === true) {
      return null;
    }

    const channel = payload.channel;
    if (!channel) {
      return null;
    }

    const user = payload.user || payload.bot_id || "unknown";
    const currentUserId = await this.context.getCurrentUserId();
    if (currentUserId && user === currentUserId) {
      return null;
    }

    const text = payload.text || "";
    const ts = payload.ts;
    const messageId = ts ? `${channel}:${ts}` : `${channel}:${user}:${text}`;

    if (this.seenMessageIds.has(messageId)) {
      return null;
    }

    const isDm = isDirectMessageChannel(channel);
    const hasMention = textContainsMention(text, currentUserId);
    if (!isDm && !hasMention) {
      return null;
    }

    if (this.seenMessageIds.size > 5000) {
      this.seenMessageIds.clear();
    }
    this.seenMessageIds.add(messageId);

    const reason = isDm ? "direct-message" : "mention";
    const channelName = this.context.getChannelName(channel);
    const channelLabel = channelName || channel;
    const title = isDm ? `Slack DM (${channelLabel})` : `Slack mention (${channelLabel})`;
    const body = trimNotificationBody(text) || (isDm ? "New direct message" : "New mention");

    return {
      type: "notification",
      data: {
        title,
        options: {
          body,
          source: "websocket",
          reason,
          channel,
          channelName,
          user,
          subtype: subtype || null,
          ts: ts || null,
        },
      },
    };
  }
}
