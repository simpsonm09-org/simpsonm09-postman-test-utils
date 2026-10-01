#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { helpText, loadRunConfig, parseArgs } from "./config.js";
import { emitCollection, runCollection } from "./run.js";
import type { RunResult } from "./types.js";

/** Print a one line summary and one line per failure. */
export function reportResult(
  result: RunResult,
  log: (line: string) => void = console.log,
  logError: (line: string) => void = console.error,
): void {
  const { stats } = result;
  log(
    `newman: ${stats.iterations} iteration(s), ${stats.requests} request(s), ${stats.assertions} assertion(s), ${stats.failedAssertions} failed, ${stats.durationMs}ms`,
  );
  for (const failure of result.failures) {
    logError(
      `${failure.item}: ${failure.test ?? "request"}: ${failure.message}`,
    );
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return 0;
  }
  const request = await loadRunConfig(options);
  if (options.emit !== undefined) {
    const written = await emitCollection(request, options.emit);
    console.log(`wrote ${written}`);
    return 0;
  }
  const result = await runCollection(request);
  reportResult(result);
  return result.success ? 0 : 1;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
