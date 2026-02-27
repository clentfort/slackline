import type { Page } from "playwright";
import { isLoggedInPage } from "./session/session-state.js";
import { ConversationManager } from "./conversation/conversation-manager.js";
import { MessageManager } from "./messages/message-manager.js";
import { SearchManager } from "./search/search-manager.js";
import { ProfileManager } from "./profile/profile-manager.js";
import { NotificationManager } from "./notifications/notification-manager.js";
import { WorkspaceContext } from "./identity/workspace-context.js";
import { SlackEventBus } from "./events/slack-event-bus.js";
import { WebSocketInterceptor } from "../playwright/websocket-interceptor.js";
import { getConfig } from "./config.js";

export class SlackClient {
  public readonly conversations: ConversationManager;
  public readonly messages: MessageManager;
  public readonly search: SearchManager;
  public readonly profile: ProfileManager;
  public readonly notifications: NotificationManager;
  public readonly workspace: WorkspaceContext;
  public readonly events: SlackEventBus;
  private interceptor: WebSocketInterceptor | null = null;

  constructor(public readonly page: Page) {
    this.workspace = new WorkspaceContext(this);
    this.events = new SlackEventBus();
    this.conversations = new ConversationManager(this);
    this.messages = new MessageManager(this);
    this.search = new SearchManager(this);
    this.profile = new ProfileManager(this);
    this.notifications = new NotificationManager(this);
  }

  async startRealTime(): Promise<void> {
    if (this.interceptor) {
      return;
    }

    await this.workspace.refresh();

    this.interceptor = new WebSocketInterceptor(this.page);
    this.interceptor.on("frame", (frame) => {
      this.events.emitRawFrame(frame);
    });

    await this.interceptor.listen();
  }

  async navigateToWorkspaceRoot(): Promise<void> {
    const workspaceUrl = getConfig().workspaceUrl;
    if (!workspaceUrl) {
      throw new Error(
        "No Slack workspace URL configured. Run `slackline auth login <workspace-url>` first.",
      );
    }
    await this.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
  }

  async isLoggedIn(timeoutMs = 15000): Promise<boolean> {
    return isLoggedInPage(this.page, timeoutMs);
  }

  async ensureLoggedIn(timeoutMs = 15000): Promise<void> {
    const loggedIn = await this.isLoggedIn(timeoutMs);
    if (!loggedIn) {
      throw new Error("Not logged in to Slack. Run `slackline auth login` first.");
    }
  }
}
