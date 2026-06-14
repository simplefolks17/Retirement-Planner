import { describe, it, expect } from "vitest";
import { scrubPointForAge } from "../ArcGraph.jsx";

// WI-2.7: the tap-to-scrub chip must show the SAME numbers as the Year-by-year
// table for a given age (it reads chartData + walkRows, never recomputes).
describe("scrubPointForAge (WI-2.7)", () => {
  const chartData = [
    { age: 64, total: 900_000 },
    { age: 65, total: 1_000_000 },
    { age: 66, total: 980_000 },
  ];
  const walkRows = [
    { age: 65, total: 1_000_000, draw: 40_000, growth: 50_000, tax: 0 },
    { age: 66, total: 980_000,   draw: 41_000, growth: 49_000, tax: 5_000 },
  ];

  it("snaps a fractional age to the nearest charted year and returns its total", () => {
    const pt = scrubPointForAge(chartData, walkRows, 65.4);
    expect(pt.age).toBe(65);
    expect(pt.total).toBe(1_000_000);
  });

  it("includes draw/growth/tax when a retirement walk row exists for that age", () => {
    const pt = scrubPointForAge(chartData, walkRows, 66);
    expect(pt.walk).toEqual({ draw: 41_000, growth: 49_000, tax: 5_000 });
  });

  it("walk is null for an accumulation year with no walk row (age 64)", () => {
    const pt = scrubPointForAge(chartData, walkRows, 64);
    expect(pt.age).toBe(64);
    expect(pt.walk).toBeNull();
  });

  it("returns null when there is no chart data", () => {
    expect(scrubPointForAge([], walkRows, 65)).toBeNull();
    expect(scrubPointForAge(undefined, walkRows, 65)).toBeNull();
  });
});
