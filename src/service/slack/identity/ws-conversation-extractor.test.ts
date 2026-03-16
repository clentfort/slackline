import { describe, expect, it } from "vitest";
import { extractConversationEntriesFromSlackMessage } from "./ws-conversation-extractor.js";

describe("ws-conversation-extractor", () => {
  it("extracts direct channel + channel_name pairs", () => {
    const entries = extractConversationEntriesFromSlackMessage({
      type: "message",
      channel: "C12345678",
      channel_name: "team-backend",
    });

    expect(entries).toEqual([
      {
        id: "C12345678",
        name: "team-backend",
        type: "channel",
      },
    ]);
  });

  it("extracts nested conversation objects", () => {
    const entries = extractConversationEntriesFromSlackMessage({
      type: "channel_joined",
      channel: {
        id: "G12345678",
        name: "project-private",
      },
    });

    expect(entries).toEqual([
      {
        id: "G12345678",
        name: "project-private",
        type: "channel",
      },
    ]);
  });

  it("extracts entries from collections and deduplicates", () => {
    const entries = extractConversationEntriesFromSlackMessage({
      type: "bulk_update",
      channels: [
        { id: "C11111111", name: "general" },
        { id: "C11111111", name: "general" },
      ],
      conversations: [{ conversation_id: "D12345678", display_name: "Alice Example" }],
    });

    expect(entries).toEqual([
      {
        id: "C11111111",
        name: "general",
        type: "channel",
      },
      {
        id: "D12345678",
        name: "Alice Example",
        type: "dm",
      },
    ]);
  });
});
