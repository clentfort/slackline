import type { SlackEvent } from "./types.js";
import type { SlackEventBus } from "../events/slack-event-bus.js";

export interface ForwarderOptions {
  onEvent?: (event: SlackEvent) => void;
  onError?: (error: Error) => void;
  verbose?: boolean;
}

/**
 * Forwards a single Slack event to a webhook URL.
 */
export async function forwardToWebhook(
  webhookUrl: string,
  event: SlackEvent,
  options: ForwarderOptions = {},
): Promise<void> {
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
      console.error(`Failed to send webhook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Sets up automatic forwarding of events from an event bus to a webhook URL.
 */
export function setupWebhookForwarding(
  eventBus: SlackEventBus,
  webhookUrl: string,
  options: ForwarderOptions = {},
): void {
  eventBus.onEvent(async (event) => {
    await forwardToWebhook(webhookUrl, event, options);
  });
}
