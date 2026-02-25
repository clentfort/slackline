import type { CDPSession, Page } from "playwright";
import { EventEmitter } from "node:events";

export interface WebSocketFrame {
  payloadData: string;
}

/**
 * Intercepts WebSocket frames from the Slack web client using the Chrome DevTools Protocol (CDP).
 */
export class WebSocketInterceptor extends EventEmitter {
  private session: CDPSession | null = null;
  private readonly frameListener = (event: any) => {
    const payloadData = event?.response?.payloadData;
    if (typeof payloadData === "string") {
      this.emit("frame", { payloadData } as WebSocketFrame);
    }
  };

  constructor(private readonly page: Page) {
    super();
  }

  /**
   * Starts listening for WebSocket frames.
   */
  async listen(): Promise<void> {
    if (this.session) {
      return;
    }

    const context = this.page.context();
    try {
      this.session = await context.newCDPSession(this.page);

      await this.session.send("Network.enable");

      this.session.on("Network.webSocketFrameReceived", this.frameListener);

      this.page.once("close", () => {
        this.session = null;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not create CDP session for websocket interception: ${errorMessage}`);
    }
  }

  /**
   * Stops listening for WebSocket frames by removing listeners and clearing the session reference.
   */
  stop(): void {
    if (this.session) {
      this.session.off("Network.webSocketFrameReceived", this.frameListener);
      this.session = null;
    }
  }
}
