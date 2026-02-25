import { SlackComponent } from "../slack-component.js";
import { isSlackUserId } from "../utils/text.js";

/**
 * Manages workspace-specific metadata like the current user ID and channel name mappings.
 */
export class WorkspaceContext extends SlackComponent {
  private currentUserId: string | null = null;
  private readonly channelNamesById = new Map<string, string>();

  /**
   * Refreshes all workspace metadata.
   */
  async refresh(): Promise<void> {
    await Promise.all([this.refreshCurrentUserId(), this.refreshChannelNames()]);
  }

  /**
   * Gets the current user ID, resolving it if not already cached.
   */
  async getCurrentUserId(): Promise<string | null> {
    if (!this.currentUserId) {
      await this.refreshCurrentUserId();
    }
    return this.currentUserId;
  }

  /**
   * Manually sets the current user ID (e.g., if learned from a WebSocket event).
   */
  setCurrentUserId(userId: string): void {
    if (isSlackUserId(userId)) {
      this.currentUserId = userId;
    }
  }

  /**
   * Gets the name of a channel by its ID.
   */
  getChannelName(channelId: string): string | undefined {
    return this.channelNamesById.get(channelId);
  }

  /**
   * Refreshes the current user ID by checking local storage and the UI.
   */
  async refreshCurrentUserId(): Promise<string | null> {
    const fromStorage = await this.resolveCurrentUserIdFromStorage();
    if (fromStorage) {
      this.currentUserId = fromStorage;
      return fromStorage;
    }

    const fromAvatar = await this.resolveCurrentUserIdFromAvatar();
    if (fromAvatar) {
      this.currentUserId = fromAvatar;
      return fromAvatar;
    }

    return null;
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

        const readFromStorageKeys = (pattern: RegExp, teamNeedle: string | null): string | null => {
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

        const srcsetCandidate = image.getAttribute("srcset")?.split(",")[0]?.trim().split(" ")[0];
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

  /**
   * Scrapes the Slack UI to build a map of channel IDs to names.
   */
  async refreshChannelNames(): Promise<void> {
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

        for (const label of document.querySelectorAll<HTMLElement>(
          '[data-qa^="channel_sidebar_name_"]',
        )) {
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
}
