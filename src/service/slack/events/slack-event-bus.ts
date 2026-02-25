import { EventEmitter } from "node:events";
import type { WebSocketFrame } from "../../playwright/websocket-interceptor.js";
import type { SlackWebSocketMessage, SlackEvent } from "../types.js";

/**
 * A central event bus for Slack-related events.
 */
export class SlackEventBus extends EventEmitter {
  /**
   * Emits a raw WebSocket frame received from the browser.
   * Also parses the frame and emits a 'slack-message' event.
   */
  emitRawFrame(frame: WebSocketFrame): void {
    this.emit("raw-frame", frame);

    const parsed = this.parseSlackWebSocketMessage(frame.payloadData);
    if (parsed) {
      this.emit("slack-message", parsed);
    }
  }

  /**
   * Adds a listener for raw WebSocket frames.
   */
  onRawFrame(listener: (frame: WebSocketFrame) => void): this {
    return this.on("raw-frame", listener);
  }

  /**
   * Adds a listener for parsed Slack WebSocket messages.
   */
  onSlackMessage(listener: (message: SlackWebSocketMessage) => void): this {
    return this.on("slack-message", listener);
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

  private parseSlackWebSocketMessage(payloadData: string): SlackWebSocketMessage | null {
    try {
      const parsed = JSON.parse(payloadData);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed as SlackWebSocketMessage;
    } catch {
      return null;
    }
  }
}
