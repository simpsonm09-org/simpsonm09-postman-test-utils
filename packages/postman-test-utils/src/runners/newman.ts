import type { NewmanInstance, NewmanRunOptions } from "newman";
import { RunnerExecutionError } from "../errors.js";
import type {
  PreparedRunRequest,
  RunFailure,
  RunResult,
  RunStats,
} from "../types.js";

export interface RunSummary {
  run?: {
    stats?: {
      iterations?: { total?: number };
      requests?: { total?: number };
      assertions?: { total?: number; failed?: number };
    };
    timings?: { started?: number; completed?: number };
    failures?: Array<{
      error?: { message?: string; test?: string };
      source?: { name?: string };
      at?: string;
    }>;
  };
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readDuration(
  timings: { started?: number; completed?: number } | undefined,
): number {
  if (
    timings &&
    typeof timings.started === "number" &&
    typeof timings.completed === "number"
  ) {
    return Math.max(0, timings.completed - timings.started);
  }
  return 0;
}

/** Map a newman summary onto the normalized result. */
export function normalizeRunSummary(
  summary: RunSummary | undefined,
): RunResult {
  const run = summary?.run ?? {};
  const stats: RunStats = {
    iterations: readCount(run.stats?.iterations?.total),
    requests: readCount(run.stats?.requests?.total),
    assertions: readCount(run.stats?.assertions?.total),
    failedAssertions: readCount(run.stats?.assertions?.failed),
    durationMs: readDuration(run.timings),
  };
  const failures: RunFailure[] = (run.failures ?? []).map((failure) => ({
    item: failure.source?.name ?? "unknown",
    message: failure.error?.message ?? "unknown failure",
    test: failure.error?.test ?? null,
    at: failure.at ?? null,
  }));
  return { runner: "newman", success: failures.length === 0, stats, failures };
}

function toNewmanOptions(request: PreparedRunRequest): NewmanRunOptions {
  const options: NewmanRunOptions = { collection: request.collection };
  if (request.environment !== undefined) {
    options.environment = request.environment;
  }
  if (request.globals !== undefined) {
    options.globals = request.globals;
  }
  if (request.iterationData !== undefined) {
    options.iterationData = request.iterationData;
  }
  if (request.folder !== undefined) {
    options.folder = request.folder;
  }
  if (request.reporters !== undefined) {
    options.reporters = request.reporters;
  }
  if (request.timeoutRequestMs !== undefined) {
    options.timeoutRequest = request.timeoutRequestMs;
  }
  if (request.bail !== undefined) {
    options.bail = request.bail;
  }
  return options;
}

export async function runNewman(
  request: PreparedRunRequest,
): Promise<RunResult> {
  const imported = (await import("newman")) as { default?: NewmanInstance };
  const newman = imported.default;
  if (!newman) {
    throw new RunnerExecutionError(
      "newman",
      "the newman module has no default export",
    );
  }
  return await new Promise<RunResult>((resolve, reject) => {
    try {
      newman.run(toNewmanOptions(request), (error, summary) => {
        if (error) {
          reject(new RunnerExecutionError("newman", error));
          return;
        }
        resolve(normalizeRunSummary(summary as RunSummary));
      });
    } catch (error) {
      reject(new RunnerExecutionError("newman", error));
    }
  });
}
