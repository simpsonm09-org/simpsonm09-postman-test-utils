import { describe, expect, it } from "vitest";
import { normalizeRunSummary } from "../src/runners/newman.js";

describe("normalizeRunSummary", () => {
  it("reads counts, duration, and failures from a summary", () => {
    const result = normalizeRunSummary({
      run: {
        stats: {
          iterations: { total: 1 },
          requests: { total: 1 },
          assertions: { total: 2, failed: 1 },
        },
        timings: { started: 100, completed: 175 },
        failures: [
          {
            source: { name: "GET /health" },
            error: { message: "expected 200", test: "returns 200" },
            at: "req",
          },
        ],
      },
    });
    expect(result.runner).toBe("newman");
    expect(result.success).toBe(false);
    expect(result.stats).toEqual({
      iterations: 1,
      requests: 1,
      assertions: 2,
      failedAssertions: 1,
      durationMs: 75,
    });
    expect(result.failures).toEqual([
      {
        item: "GET /health",
        message: "expected 200",
        test: "returns 200",
        at: "req",
      },
    ]);
  });

  it("treats a summary with no failures as success", () => {
    const result = normalizeRunSummary({ run: { stats: {}, timings: {} } });
    expect(result.success).toBe(true);
    expect(result.stats).toEqual({
      iterations: 0,
      requests: 0,
      assertions: 0,
      failedAssertions: 0,
      durationMs: 0,
    });
  });

  it("tolerates a missing summary", () => {
    expect(normalizeRunSummary(undefined).success).toBe(true);
  });
});
