import { describe, expect, it, vi } from "vitest";
import { NotificationProcessor } from "./notification-processor.js";
import type { WorkspaceContext } from "../identity/workspace-context.js";

describe("NotificationProcessor", () => {
  it("processes a message and returns a notification event", async () => {
    const mockContext = {
      getCurrentUserId: vi.fn().mockResolvedValue("U123456789"),
      getChannelName: vi.fn().mockReturnValue("general"),
    } as unknown as WorkspaceContext;

    const processor = new NotificationProcessor(mockContext);
    const payload = {
      type: "message",
      channel: "C12345678",
      user: "U99999999",
      text: "hello <@U123456789>",
      ts: "123456.789",
    };

    const event = await processor.process(payload);

    expect(event).not.toBeNull();
    expect(event?.type).toBe("notification");
    expect(event?.data.title).toBe("Slack mention (general)");
  });

  it("ignores messages from the current user", async () => {
    const mockContext = {
      getCurrentUserId: vi.fn().mockResolvedValue("U123456789"),
      getChannelName: vi.fn().mockReturnValue("general"),
    } as unknown as WorkspaceContext;

    const processor = new NotificationProcessor(mockContext);
    const payload = {
      type: "message",
      channel: "C12345678",
      user: "U123456789",
      text: "hello",
      ts: "123456.789",
    };

    const event = await processor.process(payload);

    expect(event).toBeNull();
  });
});
