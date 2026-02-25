import { describe, expect, it, vi } from "vitest";
import { WorkspaceContext } from "./workspace-context.js";
import type { SlackClient } from "../slack-client.js";
import { SlackEventBus } from "../events/slack-event-bus.js";

describe("WorkspaceContext", () => {
  it("learns current user ID from flannel message", async () => {
    const events = new SlackEventBus();
    const mockClient = {
      events,
      page: {
        evaluate: vi.fn().mockResolvedValue(null),
      },
    };

    const context = new WorkspaceContext(mockClient as unknown as SlackClient);
    await context.refresh();

    events.emitRawFrame({
      payloadData: JSON.stringify({
        type: "flannel",
        subtype: "user_subscribe_response",
        ids: ["U99988877"],
      }),
    });

    const userId = await context.getCurrentUserId();
    expect(userId).toBe("U99988877");
  });
});
