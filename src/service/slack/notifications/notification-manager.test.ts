import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationManager } from "./notification-manager.js";
import type { SlackClient } from "../slack-client.js";

type ExposedFunctions = Record<string, (...args: any[]) => unknown>;

type TestHarness = {
  manager: NotificationManager;
  mockContext: {
    serviceWorkers: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    newCDPSession: ReturnType<typeof vi.fn>;
    grantPermissions: ReturnType<typeof vi.fn>;
  };
  mockPage: {
    context: ReturnType<typeof vi.fn>;
    exposeFunction: ReturnType<typeof vi.fn>;
    addInitScript: ReturnType<typeof vi.fn>;
    evaluate: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
  };
  exposedFunctions: ExposedFunctions;
};

function createHarness(
  existingWorkers: Array<{ evaluate: ReturnType<typeof vi.fn> }> = [],
  options: {
    permissionResult?: string;
    pageUrl?: string;
  } = {},
): TestHarness {
  const exposedFunctions: ExposedFunctions = {};
  const permissionResult = options.permissionResult ?? "granted";
  const pageUrl = options.pageUrl ?? "https://app.slack.com/client/T123/C456";

  const mockContext = {
    serviceWorkers: vi.fn().mockReturnValue(existingWorkers),
    on: vi.fn(),
    newCDPSession: vi.fn(),
    grantPermissions: vi.fn().mockResolvedValue(undefined),
  };

  const mockPage = {
    context: vi.fn().mockReturnValue(mockContext),
    exposeFunction: vi
      .fn()
      .mockImplementation(async (name: string, fn: (...args: any[]) => unknown): Promise<void> => {
        exposedFunctions[name] = fn;
      }),
    addInitScript: vi.fn(),
    evaluate: vi.fn().mockImplementation(async (scriptOrFunction: unknown): Promise<unknown> => {
      if (typeof scriptOrFunction === "function") {
        return permissionResult;
      }
      return undefined;
    }),
    url: vi.fn().mockReturnValue(pageUrl),
  };

  const manager = new NotificationManager({ page: mockPage } as unknown as SlackClient);

  return {
    manager,
    mockContext,
    mockPage,
    exposedFunctions,
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
  it("registers page hook scripts and patches existing service workers", async () => {
    const existingWorker = {
      evaluate: vi.fn().mockResolvedValue(undefined),
    };
    const { manager, mockContext, mockPage } = createHarness([existingWorker]);

    await manager.listen(vi.fn());

    expect(mockPage.exposeFunction).toHaveBeenCalledWith(
      "slacklineTitleCallback",
      expect.any(Function),
    );
    expect(mockPage.exposeFunction).toHaveBeenCalledWith(
      "slacklineNotificationCallback",
      expect.any(Function),
    );
    expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(mockPage.addInitScript).toHaveBeenCalledWith(
      expect.stringContaining("__slacklineNotificationHooksInstalled"),
    );

    const pageHookEvalCall = mockPage.evaluate.mock.calls.find(
      (call) =>
        typeof call[0] === "string" && call[0].includes("__slacklineNotificationHooksInstalled"),
    );
    expect(pageHookEvalCall).toBeDefined();

    expect(mockContext.grantPermissions).toHaveBeenCalledWith(["notifications"], {
      origin: "https://app.slack.com",
    });
    expect(mockContext.newCDPSession).not.toHaveBeenCalled();
    expect(existingWorker.evaluate).toHaveBeenCalledWith(
      expect.stringContaining("__slacklineServiceWorkerNotificationHooksInstalled"),
    );
  });

  it("patches newly attached service workers", async () => {
    const { manager, mockContext } = createHarness();

    await manager.listen(vi.fn());

    const serviceWorkerCall = mockContext.on.mock.calls.find((call) => call[0] === "serviceworker");
    const serviceWorkerHandler = serviceWorkerCall?.[1] as
      | ((worker: { evaluate: ReturnType<typeof vi.fn> }) => void)
      | undefined;

    expect(serviceWorkerHandler).toBeDefined();

    const lateWorker = {
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    serviceWorkerHandler?.(lateWorker);
    await Promise.resolve();

    expect(lateWorker.evaluate).toHaveBeenCalled();
  });

  it("forwards events to webhook via exposed callbacks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, exposedFunctions } = createHarness();

    await manager.startWebhookForwarder("http://localhost:8080", { verbose: true });

    await exposedFunctions.slacklineNotificationCallback?.({ title: "SW Notification" });
    await exposedFunctions.slacklineTitleCallback?.("Inbox (1)");

    await flushAsyncEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(firstPayload).toEqual({
      type: "notification",
      data: { title: "SW Notification" },
    });

    const secondPayload = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(secondPayload).toEqual({
      type: "title",
      data: { title: "Inbox (1)" },
    });
  });

  it("service worker patch forwards showNotification payloads to page clients", async () => {
    const existingWorker = {
      evaluate: vi.fn().mockResolvedValue(undefined),
    };
    const { manager } = createHarness([existingWorker]);

    await manager.listen(vi.fn());

    const workerPatchScript = existingWorker.evaluate.mock.calls[0]?.[0] as string | undefined;

    expect(workerPatchScript).toBeDefined();

    const postMessage = vi.fn();
    const originalShowNotification = vi.fn().mockReturnValue("original-result");

    const previousSelf = (globalThis as any).self;
    (globalThis as any).self = {
      clients: {
        matchAll: vi.fn().mockResolvedValue([{ postMessage }]),
      },
      registration: {
        showNotification: originalShowNotification,
      },
      ServiceWorkerRegistration: {
        prototype: {},
      },
    };

    try {
      (0, eval)(workerPatchScript as string);

      const result = (globalThis as any).self.registration.showNotification("From worker", {
        body: "hello from sw",
      });

      expect(result).toBe("original-result");
      expect(originalShowNotification).toHaveBeenCalledWith("From worker", {
        body: "hello from sw",
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(postMessage).toHaveBeenCalledWith({
        __slacklineNotification: {
          title: "From worker",
          options: { body: "hello from sw" },
        },
      });
    } finally {
      (globalThis as any).self = previousSelf;
    }
  });

  it("warns when notification permission is not granted", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manager } = createHarness([], { permissionResult: "denied" });

    await manager.listen(vi.fn());

    expect(warnSpy).toHaveBeenCalledWith(
      "Notification permission is 'denied' for https://app.slack.com. Browser notifications may not fire.",
    );
  });

  it("continues if a service worker cannot be patched", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingWorker = {
      evaluate: vi.fn().mockRejectedValue(new Error("worker detached")),
    };
    const { manager } = createHarness([failingWorker]);

    await expect(manager.listen(vi.fn())).resolves.toBeUndefined();
    expect(failingWorker.evaluate).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to patch service worker notification hooks: worker detached",
    );
  });

  it("throws if called twice", async () => {
    const { manager } = createHarness();

    await manager.listen(vi.fn());
    await expect(manager.listen(vi.fn())).rejects.toThrow("Already listening for notifications.");
  });
});
