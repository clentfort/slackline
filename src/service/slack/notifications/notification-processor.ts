import type { SlackEvent } from "./types.js";
import { isDirectMessageChannel, isSlackUserId } from "../utils/text.js";
import type { WorkspaceContext } from "../identity/workspace-context.js";

type SlackWebSocketMessage = {
  type?: unknown;
  subtype?: unknown;
  channel?: unknown;
  user?: unknown;
  bot_id?: unknown;
  text?: unknown;
  ts?: unknown;
  hidden?: unknown;
  ids?: unknown;
};

const channelMentionPattern = /<!channel>|<!here>|<!everyone>/;

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

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

function parseSlackWebSocketMessage(payloadData: string): SlackWebSocketMessage | null {
  try {
    const parsed = JSON.parse(payloadData) as SlackWebSocketMessage;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Processes raw WebSocket messages and determines if they should trigger a notification.
 */
export class NotificationProcessor {
  private readonly seenMessageIds = new Set<string>();

  constructor(private readonly context: WorkspaceContext) {}

  /**
   * Processes a raw WebSocket frame and returns a notification event if applicable.
   */
  async process(payloadData: string): Promise<SlackEvent | null> {
    const payload = parseSlackWebSocketMessage(payloadData);
    if (!payload) {
      return null;
    }

    this.maybeLearnCurrentUserId(payload);

    const type = toStringValue(payload.type);
    if (type !== "message") {
      return null;
    }

    const subtype = toStringValue(payload.subtype);
    if (subtype && subtype !== "thread_broadcast") {
      return null;
    }

    if (payload.hidden === true) {
      return null;
    }

    const channel = toStringValue(payload.channel);
    if (!channel) {
      return null;
    }

    const user = toStringValue(payload.user) || toStringValue(payload.bot_id) || "unknown";
    const currentUserId = await this.context.getCurrentUserId();
    if (currentUserId && user === currentUserId) {
      return null;
    }

    const text = toStringValue(payload.text) || "";
    const ts = toStringValue(payload.ts);
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

  private maybeLearnCurrentUserId(payload: SlackWebSocketMessage): void {
    const type = toStringValue(payload.type);
    const subtype = toStringValue(payload.subtype);
    if (type !== "flannel" || subtype !== "user_subscribe_response") {
      return;
    }

    if (!Array.isArray(payload.ids)) {
      return;
    }

    const candidates = payload.ids
      .filter((value): value is string => typeof value === "string")
      .filter((value) => isSlackUserId(value));

    const uniqueCandidates = [...new Set(candidates)];
    if (uniqueCandidates.length === 1) {
      this.context.setCurrentUserId(uniqueCandidates[0]);
    }
  }
}
