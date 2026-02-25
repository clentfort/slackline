import { SlackComponent } from "../slack-component.js";
import { isDirectMessageChannel } from "../utils/text.js";
import type { SlackEvent, SlackWebSocketMessage } from "../types.js";

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
 * Manages the high-level notification listening logic.
 */
export class NotificationManager extends SlackComponent {
  private readonly seenMessageIds = new Set<string>();
  private isListening = false;

  /**
   * Starts listening for Slack events and notifications.
   * @param onEvent Optional callback for high-level events.
   */
  async listen(onEvent?: (event: SlackEvent) => void): Promise<void> {
    if (this.isListening) {
      if (onEvent) {
        this.client.events.onEvent(onEvent);
      }
      return;
    }
    this.isListening = true;

    if (onEvent) {
      this.client.events.onEvent(onEvent);
    }

    this.client.events.onSlackMessage(async (payload) => {
      const event = await this.processMessage(payload);
      if (event) {
        this.client.events.emitEvent(event);
      }
    });

    await this.client.startRealTime();
  }

  private async processMessage(payload: SlackWebSocketMessage): Promise<SlackEvent | null> {
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
    const currentUserId = await this.client.workspace.getCurrentUserId();
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
    const channelName = this.client.workspace.getChannelName(channel);
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
