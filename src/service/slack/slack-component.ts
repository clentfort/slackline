import type { Page } from 'playwright'
import type { SlackClient } from './slack-client.js'

export abstract class SlackComponent {
  constructor(protected readonly client: SlackClient) {}

  protected get page(): Page {
    return this.client.page
  }
}
