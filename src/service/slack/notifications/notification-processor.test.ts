import { describe, expect, it, vi } from "vitest";
import { NotificationProcessor } from "./notification-processor.js";
import type { WorkspaceContext } from "../identity/workspace-context.js";

describe("NotificationProcessor", () => {
  it("processes a message and returns a notification event", async () => {
    const mockContext = {
      getCurrentUserId: vi.fn().mockResolvedValue("U123456789"),
      getChannelName: vi.fn().mockReturnValue("general"),
      setCurrentUserId: vi.fn(),
    } as unknown as WorkspaceContext;

    const processor = new NotificationProcessor(mockContext);
    const payloadData = JSON.stringify({
      type: "message",
      channel: "C12345678",
      user: "U99999999",
      text: "hello <@U123456789>",
      ts: "123456.789",
    });

    const event = await processor.process(payloadData);

    expect(event).not.toBeNull();
    expect(event?.type).toBe("notification");
    expect(event?.data.title).toBe("Slack mention (general)");
  });

  it("ignores messages from the current user", async () => {
    const mockContext = {
      getCurrentUserId: vi.fn().mockResolvedValue("U123456789"),
      getChannelName: vi.fn().mockReturnValue("general"),
      setCurrentUserId: vi.fn(),
    } as unknown as WorkspaceContext;

    const processor = new NotificationProcessor(mockContext);
    const payloadData = JSON.stringify({
      type: "message",
      channel: "C12345678",
      user: "U123456789",
      text: "hello",
      ts: "123456.789",
    });

    const event = await processor.process(payloadData);

    expect(event).toBeNull();
  });

  it("learns the current user ID from flannel events", async () => {
    const mockContext = {
      getCurrentUserId: vi.fn().mockResolvedValue(null),
      setCurrentUserId: vi.fn(),
    } as unknown as WorkspaceContext;

    const processor = new NotificationProcessor(mockContext);
    const payloadData = JSON.stringify({
      type: "flannel",
      subtype: "user_subscribe_response",
      ids: ["U123456789"],
    });

    await processor.process(payloadData);

    expect(mockContext.setCurrentUserId).toHaveBeenCalledWith("U123456789");
  });
});
