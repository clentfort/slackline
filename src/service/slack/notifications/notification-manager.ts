import { SlackComponent } from "../slack-component.js";
import { NotificationProcessor } from "./notification-processor.js";
import type { SlackEvent } from "../types.js";

/**
 * Manages the high-level notification listening logic.
 */
export class NotificationManager extends SlackComponent {
  private processor: NotificationProcessor | null = null;
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

    this.processor = new NotificationProcessor(this.client.workspace);

    this.client.events.onSlackMessage(async (payload) => {
      const event = await this.processor!.process(payload);
      if (event) {
        this.client.events.emitEvent(event);
      }
    });

    await this.client.startRealTime();
  }
}
