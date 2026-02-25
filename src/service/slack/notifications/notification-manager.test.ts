import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationManager } from "./notification-manager.js";
import type { SlackClient } from "../slack-client.js";
import { SlackEventBus } from "../events/slack-event-bus.js";
import { setupWebhookForwarding } from "./webhook-forwarder.js";

type HarnessOptions = {
  currentUserId?: string | null;
  sidebarConversations?: Array<{ id: string; name: string }>;
};

type Harness = {
  manager: NotificationManager;
  events: SlackEventBus;
  mockClient: any;
};

function createHarness(options: HarnessOptions = {}): Harness {
  const currentUserId = options.currentUserId ?? "U123456789";
  const sidebarConversations = options.sidebarConversations ?? [];
  const events = new SlackEventBus();

  const mockWorkspace = {
    refresh: vi.fn().mockResolvedValue(undefined),
    getCurrentUserId: vi.fn().mockResolvedValue(currentUserId),
    getChannelName: vi.fn().mockImplementation((id: string) => {
      return sidebarConversations.find((c) => c.id === id)?.name;
    }),
    setCurrentUserId: vi.fn(),
  };

  const mockClient = {
    events: events,
    workspace: mockWorkspace,
    startRealTime: vi.fn().mockResolvedValue(undefined),
  };

  const manager = new NotificationManager(mockClient as unknown as SlackClient);

  return {
    manager,
    events,
    mockClient,
  };
}

async function flushAsyncEvents(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotificationManager", () => {
  it("starts real-time when listen is called", async () => {
    const { manager, mockClient } = createHarness();

    await manager.listen();

    expect(mockClient.startRealTime).toHaveBeenCalledTimes(1);
  });

  it("processes messages and emits events on the bus", async () => {
    const { manager, events } = createHarness();
    const onEvent = vi.fn();
    events.onEvent(onEvent);

    await manager.listen();

    events.emitRawFrame({
      payloadData: JSON.stringify({
        type: "message",
        channel: "D12345678",
        user: "U99999999",
        text: "dm hello",
        ts: "1772001.0001",
      }),
    });

    await flushAsyncEvents();

    expect(onEvent).toHaveBeenCalledWith({
      type: "notification",
      data: {
        title: "Slack DM (D12345678)",
        options: {
          body: "dm hello",
          source: "websocket",
          reason: "direct-message",
          channel: "D12345678",
          channelName: undefined,
          user: "U99999999",
          subtype: null,
          ts: "1772001.0001",
        },
      },
    });
  });

  it("ignores messages from current user", async () => {
    const { manager, events } = createHarness({ currentUserId: "U123456789" });
    const onEvent = vi.fn();
    events.onEvent(onEvent);

    await manager.listen();

    events.emitRawFrame({
      payloadData: JSON.stringify({
        type: "message",
        channel: "D12345678",
        user: "U123456789",
        text: "self message",
        ts: "1772001.0003",
      }),
    });

    await flushAsyncEvents();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("uses webhook forwarder correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, events } = createHarness();

    setupWebhookForwarding(events, "http://localhost:8080");
    await manager.listen();

    events.emitRawFrame({
      payloadData: JSON.stringify({
        type: "message",
        channel: "D12345678",
        user: "U99999999",
        text: "hello",
        ts: "1772001.0005",
      }),
    });

    await flushAsyncEvents();

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.data.options.body).toBe("hello");
  });
});
