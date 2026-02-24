import type { Page } from 'playwright'
import { isLoggedInPage } from './session/session-state.js'
import { ConversationManager } from './conversation/conversation-manager.js'
import { MessageManager } from './messages/message-manager.js'
import { SearchManager } from './search/search-manager.js'
import { ProfileManager } from './profile/profile-manager.js'
import { getConfig } from './config.js'

export class SlackClient {
  public readonly conversations: ConversationManager
  public readonly messages: MessageManager
  public readonly search: SearchManager
  public readonly profile: ProfileManager

  constructor(public readonly page: Page) {
    this.conversations = new ConversationManager(this)
    this.messages = new MessageManager(this)
    this.search = new SearchManager(this)
    this.profile = new ProfileManager(this)
  }

  async navigateToWorkspaceRoot(): Promise<void> {
    const workspaceUrl = getConfig().workspaceUrl
    await this.page.goto(workspaceUrl, { waitUntil: 'domcontentloaded' })
  }

  async isLoggedIn(timeoutMs = 15000): Promise<boolean> {
    return isLoggedInPage(this.page, timeoutMs)
  }

  async ensureLoggedIn(timeoutMs = 15000): Promise<void> {
    const loggedIn = await this.isLoggedIn(timeoutMs)
    if (!loggedIn) {
      throw new Error('Not logged in to Slack. Run `slackline auth login` first.')
    }
  }
}
