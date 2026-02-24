import type { Page } from "playwright";
import { SlackClient } from "../slack-client.js";
import { type SlackMessage, MessageManager } from "./message-manager.js";

export { type SlackMessage };

export async function readVisibleMessages(page: Page): Promise<SlackMessage[]> {
  const client = new SlackClient(page);
  return client.messages.readVisible();
}

export function pickLatestMessages(messages: SlackMessage[], limit: number): SlackMessage[] {
  return MessageManager.pickLatest(messages, limit);
}
