import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getKnownConversationName,
  rememberKnownConversation,
  rememberKnownConversations,
  resetConversationMappingsForTests,
  resolveKnownConversationId,
  workspaceKeyFromUrl,
} from "./conversation-map-store.js";

describe("conversation-map-store", () => {
  beforeEach(() => {
    process.env.PI_SLACKLINE_DIR = mkdtempSync(path.join(os.tmpdir(), "slackline-map-test-"));
    resetConversationMappingsForTests();
  });

  it("should parse a workspace key from Slack client URLs", () => {
    const key = workspaceKeyFromUrl("https://app.slack.com/client/T12345678/C99999999");
    expect(key).toBe("team:T12345678");
  });

  it("should resolve by normalized alias", () => {
    rememberKnownConversation({
      workspaceKey: "team:T123",
      id: "C11111111",
      name: "Team Backend",
      aliases: ["#backend", "Backend"],
      type: "channel",
    });

    expect(
      resolveKnownConversationId({
        workspaceKey: "team:T123",
        target: "backend",
      }),
    ).toBe("C11111111");

    expect(
      resolveKnownConversationId({
        workspaceKey: "team:T123",
        target: "#Team Backend",
      }),
    ).toBe("C11111111");
  });

  it("should keep mappings isolated by workspace", () => {
    rememberKnownConversations({
      workspaceKey: "team:T111",
      entries: [{ id: "CAAAAAAA1", name: "general", type: "channel" }],
    });

    expect(
      resolveKnownConversationId({
        workspaceKey: "team:T222",
        target: "general",
      }),
    ).toBeUndefined();
  });

  it("should provide reverse lookup from ID to name", () => {
    rememberKnownConversation({
      workspaceKey: "team:T123",
      id: "D12345678",
      name: "Alice Example",
      type: "dm",
    });

    expect(
      getKnownConversationName({
        workspaceKey: "team:T123",
        conversationId: "d12345678",
      }),
    ).toBe("Alice Example");
  });
});
