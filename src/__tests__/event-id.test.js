import { describe, it, expect, vi } from "vitest";
import { mintEventId } from "../utils/event-id.js";

describe("mintEventId (BUG-163)", () => {
  it("is always a non-empty string", () => {
    const id = mintEventId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("is unique across 10,000 calls in the same millisecond, even with frozen time and randomness", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const ids = new Set();
      for (let i = 0; i < 10_000; i++) ids.add(mintEventId());
      expect(ids.size).toBe(10_000);
      for (const id of ids) expect(typeof id).toBe("string");
    } finally {
      rnd.mockRestore();
      vi.useRealTimers();
    }
  });
});
