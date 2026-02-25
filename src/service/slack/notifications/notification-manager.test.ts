import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationManager } from "./notification-manager.js";
import type { SlackClient } from "../slack-client.js";

type HarnessOptions = {
  pageUrl?: string;
  currentUserIdFromStorage?: string | null;
  currentUserIdFromAvatar?: string | null;
  sidebarConversations?: Array<{ id: string; name: string }>;
};

type Harness = {
  manager: NotificationManager;
  mockContext: {
    newCDPSession: ReturnType<typeof vi.fn>;
  };
  mockCdpSession: {
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  emitCdpEvent: (eventName: string, payload: unknown) => void;
};

function createHarness(options: HarnessOptions = {}): Harness {
  const pageUrl = options.pageUrl ?? "https://app.slack.com/client/T123/C456";
  const currentUserIdFromStorage = options.currentUserIdFromStorage ?? "U123456789";
  const currentUserIdFromAvatar = options.currentUserIdFromAvatar ?? "U123456789";
  const sidebarConversations = options.sidebarConversations ?? [];
  const cdpEventHandlers = new Map<string, Array<(payload: unknown) => void>>();

  const mockCdpSession = {
    send: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((eventName: string, handler: (payload: unknown) => void) => {
      const handlers = cdpEventHandlers.get(eventName) ?? [];
      handlers.push(handler);
      cdpEventHandlers.set(eventName, handlers);
    }),
  };

  const mockContext = {
    newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
  };

  const mockPage = {
    context: vi.fn().mockReturnValue(mockContext),
    once: vi.fn(),
    url: vi.fn().mockReturnValue(pageUrl),
    evaluate: vi.fn().mockImplementation(async (scriptOrFunction: unknown): Promise<unknown> => {
      if (typeof scriptOrFunction !== "function") {
        return undefined;
      }

      const functionSource = scriptOrFunction.toString();
      if (functionSource.includes("localStorage.getItem(\"localConfig_v2\")")) {
        return currentUserIdFromStorage;
      }
      if (functionSource.includes("button[data-qa=\"user-button\"] img")) {
        return currentUserIdFromAvatar;
      }
      if (
        functionSource.includes("channel_sidebar_name_") &&
        functionSource.includes("window.location.pathname.match")
      ) {
        return sidebarConversations;
      }

      return undefined;
    }),
  };

  const manager = new NotificationManager({ page: mockPage } as unknown as SlackClient);

  return {
    manager,
    mockContext,
    mockCdpSession,
    emitCdpEvent: (eventName: string, payload: unknown) => {
      const handlers = cdpEventHandlers.get(eventName) ?? [];
      for (const handler of handlers) {
        handler(payload);
      }
    },
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
  it("creates a page CDP session and enables Network websocket stream", async () => {
    const { manager, mockContext, mockCdpSession } = createHarness();

    await manager.listen(vi.fn());

    expect(mockContext.newCDPSession).toHaveBeenCalledTimes(1);
    expect(mockCdpSession.send).toHaveBeenCalledWith("Network.enable");
  });

  it("throws if called twice", async () => {
    const { manager } = createHarness();

    await manager.listen(vi.fn());
    await expect(manager.listen(vi.fn())).rejects.toThrow("Already listening for notifications.");
  });

  it("forwards websocket DM frames as notification events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, emitCdpEvent } = createHarness();

    await manager.startWebhookForwarder("http://localhost:8080", { verbose: true });

    emitCdpEvent("Network.webSocketFrameReceived", {
      response: {
        payloadData: JSON.stringify({
          type: "message",
          channel: "D12345678",
          user: "U99999999",
          text: "dm hello",
          ts: "1772001.0001",
        }),
      },
    });

    await flushAsyncEvents();

    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload).toEqual({
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

  it("forwards websocket mention frames as notification events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, emitCdpEvent } = createHarness();

    await manager.startWebhookForwarder("http://localhost:8080", { verbose: true });

    emitCdpEvent("Network.webSocketFrameReceived", {
      response: {
        payloadData: JSON.stringify({
          type: "message",
          channel: "C12345678",
          user: "U99999999",
          text: "hello <@U123456789>",
          ts: "1772001.0002",
        }),
      },
    });

    await flushAsyncEvents();

    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload.data.title).toBe("Slack mention (C12345678)");
    expect(payload.data.options.reason).toBe("mention");
  });

  it("ignores websocket messages from current user", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, emitCdpEvent } = createHarness();

    await manager.startWebhookForwarder("http://localhost:8080", { verbose: true });

    emitCdpEvent("Network.webSocketFrameReceived", {
      response: {
        payloadData: JSON.stringify({
          type: "message",
          channel: "D12345678",
          user: "U123456789",
          text: "self message",
          ts: "1772001.0003",
        }),
      },
    });

    await flushAsyncEvents();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses storage-based user id and includes known channel names", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, emitCdpEvent } = createHarness({
      currentUserIdFromStorage: "UAAAAAAA1",
      currentUserIdFromAvatar: null,
      sidebarConversations: [{ id: "C12345678", name: "general" }],
    });

    await manager.startWebhookForwarder("http://localhost:8080", { verbose: true });

    emitCdpEvent("Network.webSocketFrameReceived", {
      response: {
        payloadData: JSON.stringify({
          type: "message",
          channel: "C12345678",
          user: "U99999999",
          text: "hello <@UAAAAAAA1>",
          ts: "1772001.0004",
        }),
      },
    });

    await flushAsyncEvents();

    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload.data.title).toBe("Slack mention (general)");
    expect(payload.data.options.channelName).toBe("general");
  });
});
