import { EventEmitter } from "node:events";
import type { WebSocketFrame } from "../../playwright/websocket-interceptor.js";
import type { SlackEvent } from "../notifications/types.js";

/**
 * A central event bus for Slack-related events.
 */
export class SlackEventBus extends EventEmitter {
  /**
   * Emits a raw WebSocket frame received from the browser.
   */
  emitRawFrame(frame: WebSocketFrame): void {
    this.emit("raw-frame", frame);
  }

  /**
   * Adds a listener for raw WebSocket frames.
   */
  onRawFrame(listener: (frame: WebSocketFrame) => void): this {
    return this.on("raw-frame", listener);
  }

  /**
   * Emits a high-level Slack event (e.g., a notification).
   */
  emitEvent(event: SlackEvent): void {
    this.emit("event", event);
  }

  /**
   * Adds a listener for high-level Slack events.
   */
  onEvent(listener: (event: SlackEvent) => void): this {
    return this.on("event", listener);
  }
}
