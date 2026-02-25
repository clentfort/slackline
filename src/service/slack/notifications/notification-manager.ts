import type { CDPSession } from "playwright";

import { SlackComponent } from "../slack-component.js";
import type { SlackEvent } from "./types.js";

export interface ForwarderOptions {
  onEvent?: (event: SlackEvent) => void;
  onError?: (error: Error) => void;
  verbose?: boolean;
}

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

function isSlackUserId(value: string): boolean {
  return /^U[A-Z0-9]{8,}$/.test(value);
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isDirectMessageChannel(channel: string): boolean {
  return /^D[A-Z0-9]+$/.test(channel);
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

export class NotificationManager extends SlackComponent {
  private isListening = false;
  private pageCdpSession: CDPSession | null = null;
  private currentUserId: string | null = null;
  private readonly channelNamesById = new Map<string, string>();

  async listen(onEvent: (event: SlackEvent) => void): Promise<void> {
    if (this.isListening) {
      throw new Error("Already listening for notifications.");
    }
    this.isListening = true;

    const pageCdpSession = await this.ensurePageCdpSession();
    await this.refreshChannelNameIndex();
    await this.installWebSocketNotificationStream(pageCdpSession, onEvent);
  }

  private async ensurePageCdpSession(): Promise<CDPSession> {
    if (this.pageCdpSession) {
      return this.pageCdpSession;
    }

    const context = this.page.context();
    const session = await context.newCDPSession(this.page).catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not create CDP session for websocket notifications: ${errorMessage}`);
    });

    this.pageCdpSession = session;
    this.page.once("close", () => {
      if (this.pageCdpSession === session) {
        this.pageCdpSession = null;
      }
    });

    return session;
  }

  private async installWebSocketNotificationStream(
    session: CDPSession,
    onEvent: (event: SlackEvent) => void,
  ): Promise<void> {
    this.currentUserId = await this.resolveCurrentUserId();
    if (!this.currentUserId) {
      console.warn(
        "Could not determine current Slack user ID. Mention detection may miss direct mentions.",
      );
    }

    await session.send("Network.enable").catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not enable websocket notification stream: ${errorMessage}`);
    });

    const seenMessageIds = new Set<string>();

    session.on("Network.webSocketFrameReceived", (event) => {
      const payloadData = event?.response?.payloadData;
      if (typeof payloadData !== "string") {
        return;
      }

      const payload = parseSlackWebSocketMessage(payloadData);
      if (!payload) {
        return;
      }

      this.maybeLearnCurrentUserIdFromWebSocket(payload);

      const derivedEvent = this.buildNotificationEventFromWebSocketMessage(payload, seenMessageIds);
      if (derivedEvent) {
        onEvent(derivedEvent);
      }
    });
  }

  private buildNotificationEventFromWebSocketMessage(
    payload: SlackWebSocketMessage,
    seenMessageIds: Set<string>,
  ): SlackEvent | null {
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
    if (this.currentUserId && user === this.currentUserId) {
      return null;
    }

    const text = toStringValue(payload.text) || "";
    const ts = toStringValue(payload.ts);
    const messageId = ts ? `${channel}:${ts}` : `${channel}:${user}:${text}`;

    if (seenMessageIds.has(messageId)) {
      return null;
    }

    const isDm = isDirectMessageChannel(channel);
    const hasMention = textContainsMention(text, this.currentUserId);
    if (!isDm && !hasMention) {
      return null;
    }

    if (seenMessageIds.size > 5000) {
      seenMessageIds.clear();
    }
    seenMessageIds.add(messageId);

    const reason = isDm ? "direct-message" : "mention";
    const channelName = this.channelNamesById.get(channel);
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

  private async resolveCurrentUserId(): Promise<string | null> {
    const fromStorage = await this.resolveCurrentUserIdFromStorage();
    if (fromStorage) {
      return fromStorage;
    }

    return this.resolveCurrentUserIdFromAvatar();
  }

  private async resolveCurrentUserIdFromStorage(): Promise<string | null> {
    return this.page
      .evaluate(() => {
        const userIdPattern = /^U[A-Z0-9]{8,}$/;
        const teamId = window.location.pathname.match(/\/client\/([^/]+)/)?.[1] || null;

        const readFromLocalConfig = (): string | null => {
          const localConfigRaw = window.localStorage.getItem("localConfig_v2");
          if (!localConfigRaw) {
            return null;
          }

          try {
            const parsed = JSON.parse(localConfigRaw) as {
              teams?: Record<string, { user_id?: string }>;
            };
            const teams = parsed.teams;
            if (!teams || typeof teams !== "object") {
              return null;
            }

            if (teamId) {
              const userId = teams[teamId]?.user_id;
              if (typeof userId === "string" && userIdPattern.test(userId)) {
                return userId;
              }
            }

            for (const team of Object.values(teams)) {
              const userId = team?.user_id;
              if (typeof userId === "string" && userIdPattern.test(userId)) {
                return userId;
              }
            }
          } catch {
            return null;
          }

          return null;
        };

        const readFromStorageKeys = (
          pattern: RegExp,
          teamNeedle: string | null,
        ): string | null => {
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key) {
              continue;
            }
            if (teamNeedle && !key.includes(teamNeedle)) {
              continue;
            }

            const match = key.match(pattern);
            if (match?.[1] && userIdPattern.test(match[1])) {
              return match[1];
            }
          }

          return null;
        };

        const teamPersistNeedle = teamId ? `::${teamId}::` : null;
        const teamExperimentNeedle = teamId ? `-${teamId}-` : null;

        return (
          readFromLocalConfig() ||
          readFromStorageKeys(/^persist-v1::T[A-Z0-9]+::(U[A-Z0-9]{8,})::/, teamPersistNeedle) ||
          readFromStorageKeys(
            /^experiment-storage-v1-T[A-Z0-9]+-(U[A-Z0-9]{8,})$/,
            teamExperimentNeedle,
          ) ||
          readFromStorageKeys(/^persist-v1::T[A-Z0-9]+::(U[A-Z0-9]{8,})::/, null) ||
          readFromStorageKeys(/^experiment-storage-v1-T[A-Z0-9]+-(U[A-Z0-9]{8,})$/, null)
        );
      })
      .then((value) => {
        return typeof value === "string" && isSlackUserId(value) ? value : null;
      })
      .catch(() => null);
  }

  private async resolveCurrentUserIdFromAvatar(): Promise<string | null> {
    return this.page
      .evaluate(() => {
        const image = document.querySelector<HTMLImageElement>('button[data-qa="user-button"] img');
        if (!image) {
          return null;
        }

        const srcsetCandidate = image
          .getAttribute("srcset")
          ?.split(",")[0]
          ?.trim()
          .split(" ")[0];
        const candidates = [image.getAttribute("src"), srcsetCandidate];

        for (const candidate of candidates) {
          if (!candidate) {
            continue;
          }

          const match = candidate.match(/-([UW][A-Z0-9]{8,})-/);
          if (match?.[1]) {
            return match[1];
          }
        }

        return null;
      })
      .then((value) => {
        return typeof value === "string" && isSlackUserId(value) ? value : null;
      })
      .catch(() => null);
  }

  private maybeLearnCurrentUserIdFromWebSocket(payload: SlackWebSocketMessage): void {
    if (this.currentUserId) {
      return;
    }

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
      this.currentUserId = uniqueCandidates[0];
    }
  }

  private async refreshChannelNameIndex(): Promise<void> {
    const entries = await this.page
      .evaluate(() => {
        const normalize = (value: string | null | undefined): string => {
          return (value || "").replace(/\s+/g, " ").trim();
        };

        const channelEntries: Array<{ id: string; name: string }> = [];
        const seen = new Set<string>();

        const addEntry = (id: string | null | undefined, name: string | null | undefined): void => {
          const normalizedId = normalize(id);
          const normalizedName = normalize(name);
          if (!normalizedId || !normalizedName) {
            return;
          }
          if (!/^[CDG][A-Z0-9]+$/.test(normalizedId) && !/^D[A-Z0-9]+$/.test(normalizedId)) {
            return;
          }

          const dedupeKey = `${normalizedId}|${normalizedName}`;
          if (seen.has(dedupeKey)) {
            return;
          }
          seen.add(dedupeKey);
          channelEntries.push({ id: normalizedId, name: normalizedName });
        };

        for (const label of document.querySelectorAll<HTMLElement>('[data-qa^="channel_sidebar_name_"]')) {
          const anchor = label.closest<HTMLAnchorElement>('a[href*="/client/"]');
          const href = anchor?.getAttribute("href") || "";
          const idFromHref = href.match(/\/client\/[^/]+\/([^/?]+)/)?.[1] || null;
          addEntry(idFromHref, label.textContent);
        }

        const activeConversationId =
          window.location.pathname.match(/\/client\/[^/]+\/([^/?]+)/)?.[1] || null;
        const activeConversationName =
          normalize(document.querySelector('[data-qa="channel_name"]')?.textContent) ||
          normalize(document.querySelector('[data-qa="channel_name_button"]')?.textContent) ||
          null;
        addEntry(activeConversationId, activeConversationName);

        return channelEntries;
      })
      .catch(() => [] as Array<{ id: string; name: string }>);

    for (const entry of entries) {
      this.channelNamesById.set(entry.id, entry.name);
    }
  }

  async startWebhookForwarder(webhookUrl: string, options: ForwarderOptions = {}): Promise<void> {
    await this.listen(async (event) => {
      if (options.onEvent) {
        options.onEvent(event);
      }

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });
        if (!response.ok && options.verbose) {
          console.error(`Webhook returned error: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        if (options.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)));
        } else if (options.verbose) {
          console.error(
            `Failed to send webhook: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  }
}
