import { SlackComponent } from "../slack-component.js";
import { WebSocketInterceptor } from "../../playwright/websocket-interceptor.js";
import { NotificationProcessor } from "./notification-processor.js";
import type { SlackEvent } from "./types.js";
import { setupWebhookForwarding, type ForwarderOptions } from "./webhook-forwarder.js";

export type { ForwarderOptions };

/**
 * Manages the high-level notification listening and forwarding logic.
 * This class ties together the WebSocket interceptor, notification processor, and event bus.
 */
export class NotificationManager extends SlackComponent {
  private interceptor: WebSocketInterceptor | null = null;
  private processor: NotificationProcessor | null = null;
  private isListening = false;

  /**
   * Starts listening for Slack events and notifications.
   * @param onEvent Optional callback for high-level events.
   */
  async listen(onEvent?: (event: SlackEvent) => void): Promise<void> {
    if (this.isListening) {
      throw new Error("Already listening for notifications.");
    }
    this.isListening = true;

    if (onEvent) {
      this.client.events.onEvent(onEvent);
    }

    // Ensure workspace context is initialized before processing events
    await this.client.workspace.refresh();

    this.interceptor = new WebSocketInterceptor(this.page);
    this.processor = new NotificationProcessor(this.client.workspace);

    this.interceptor.on("frame", async (frame) => {
      // Forward raw frames to the event bus
      this.client.events.emitRawFrame(frame);

      // Process the frame for notifications
      const event = await this.processor!.process(frame.payloadData);
      if (event) {
        this.client.events.emitEvent(event);
      }
    });

    await this.interceptor.listen();
  }

  /**
   * Starts listening for notifications and forwards them to a webhook URL.
   */
  async startWebhookForwarder(webhookUrl: string, options: ForwarderOptions = {}): Promise<void> {
    setupWebhookForwarding(this.client.events, webhookUrl, options);
    await this.listen();
  }
}
