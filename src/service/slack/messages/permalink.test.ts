import { describe, it, expect } from "vitest";
import { buildSlackThreadUrl, parseSlackPermalink } from "./permalink.js";

describe("parseSlackPermalink", () => {
  it("parses archive permalinks with packed timestamps", () => {
    const parsed = parseSlackPermalink(
      "https://example.slack.com/archives/C0406V926/p1772531498347919",
    );

    expect(parsed).toMatchObject({
      workspaceHost: "example.slack.com",
      channelId: "C0406V926",
      messageTimestampRaw: "1772531498.347919",
      messageTimestampUnix: 1772531498.347919,
    });
  });

  it("parses thread_ts from query parameters", () => {
    const parsed = parseSlackPermalink(
      "https://example.slack.com/archives/C0406V926/p1772531498347919?thread_ts=1772531498.347919&cid=C0406V926",
    );

    expect(parsed?.threadTimestampRaw).toBe("1772531498.347919");
    expect(parsed?.threadTimestampUnix).toBe(1772531498.347919);
  });

  it("parses /messages permalinks too", () => {
    const parsed = parseSlackPermalink(
      "https://example.slack.com/messages/C0406V926/p1772531498347919",
    );

    expect(parsed?.channelId).toBe("C0406V926");
    expect(parsed?.messageTimestampRaw).toBe("1772531498.347919");
  });

  it("returns undefined for non-permalink URLs", () => {
    const parsed = parseSlackPermalink("https://example.slack.com/client/T123/C0406V926");
    expect(parsed).toBeUndefined();
  });
});

describe("buildSlackThreadUrl", () => {
  it("adds thread_ts and cid query params", () => {
    const url = buildSlackThreadUrl({
      permalinkUrl: "https://example.slack.com/archives/C0406V926/p1772531498347919",
      channelId: "C0406V926",
      threadTimestampUnix: 1772531498.347919,
    });

    expect(url).toBe(
      "https://example.slack.com/archives/C0406V926/p1772531498347919?thread_ts=1772531498.347919&cid=C0406V926",
    );
  });
});
