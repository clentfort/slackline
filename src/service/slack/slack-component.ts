import type { Page } from 'playwright'
import type { SlackClient } from './slack-client.js'
import { getConfig, type SlackConfig } from './config.js'

export abstract class SlackComponent {
  constructor(protected readonly client: SlackClient) {}

  protected get page(): Page {
    return this.client.page
  }

  protected get config(): SlackConfig {
    return getConfig()
  }
}
