import { describe, it, expect } from "vitest";
import { MessageManager, type SlackMessage } from "./message-manager.js";

describe("MessageManager", () => {
  describe("pickLatest", () => {
    it("should return the latest messages in reverse order", () => {
      const messages: SlackMessage[] = [
        { text: "first", timestampUnix: 1 },
        { text: "second", timestampUnix: 2 },
        { text: "third", timestampUnix: 3 },
      ];

      const latest = MessageManager.pickLatest(messages, 2);
      expect(latest).toHaveLength(2);
      expect(latest[0].text).toBe("third");
      expect(latest[1].text).toBe("second");
    });

    it("should return latest messages even when input is newest-first", () => {
      const messages: SlackMessage[] = [
        { text: "third", timestampUnix: 3 },
        { text: "second", timestampUnix: 2 },
        { text: "first", timestampUnix: 1 },
      ];

      const latest = MessageManager.pickLatest(messages, 2);
      expect(latest).toHaveLength(2);
      expect(latest[0].text).toBe("third");
      expect(latest[1].text).toBe("second");
    });

    it("should deduplicate messages", () => {
      const messages: SlackMessage[] = [
        { user: "A", text: "hi", timestampLabel: "10:00" },
        { user: "A", text: "hi", timestampLabel: "10:00" },
        { user: "B", text: "hello", timestampLabel: "10:01" },
      ];

      const latest = MessageManager.pickLatest(messages, 10);
      expect(latest).toHaveLength(2);
      expect(latest[0].text).toBe("hello");
      expect(latest[1].text).toBe("hi");
    });

    it("should not dedupe distinct messages with same text and label", () => {
      const messages: SlackMessage[] = [
        { user: "A", text: "same", timestampLabel: "10:00", timestampUnix: 1000.1 },
        { user: "A", text: "same", timestampLabel: "10:00", timestampUnix: 1000.9 },
      ];

      const latest = MessageManager.pickLatest(messages, 10);
      expect(latest).toHaveLength(2);
      expect(latest[0].timestampUnix).toBe(1000.9);
      expect(latest[1].timestampUnix).toBe(1000.1);
    });
  });
});
