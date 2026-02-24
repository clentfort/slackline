import { describe, it, expect } from "vitest";
import { normalize, parseUnixSeconds, escapeRegExp } from "./text.js";

describe("text utilities", () => {
  describe("normalize", () => {
    it("should normalize whitespace", () => {
      expect(normalize("  hello   world  ")).toBe("hello world");
    });

    it("should handle null and undefined", () => {
      expect(normalize(null)).toBe("");
      expect(normalize(undefined)).toBe("");
    });
  });

  describe("parseUnixSeconds", () => {
    it("should parse valid numbers", () => {
      expect(parseUnixSeconds("123.456")).toBe(123.456);
    });

    it("should return undefined for invalid input", () => {
      expect(parseUnixSeconds("abc")).toBeUndefined();
      expect(parseUnixSeconds(null)).toBeUndefined();
    });
  });

  describe("escapeRegExp", () => {
    it("should escape special characters", () => {
      expect(escapeRegExp("hello.world*")).toBe("hello\\.world\\*");
    });
  });
});
