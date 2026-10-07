/** Runs the compiled scenario against the current Postman response. */

import { runScenarioAssertions, runScenarioEvents } from "./assertions.js";
import { decodeScenarioSse, normalizeContentType } from "./sse.js";
import type { ScenarioSseEvent } from "./sse.js";
import type { ValidationResult } from "./types.js";
import { processScenarioVariables } from "./variables.js";

/** The response facts the validators read, decoded once per execution. */
interface ResponseContext {
  status: number;
  contentType: string;
  isNoContent: boolean;
  body: any;
  bodyParseError: boolean;
  events: ScenarioSseEvent[];
}

export function executeScenarioValidations(
  compiled: any,
  options: any = {},
): ValidationResult {
  const reportTest =
    options.reportTest ||
    ((name: string, callback: () => void) => pm.test(name, callback));
  const reportSkippedTest =
    options.reportSkippedTest ||
    ((name: string, callback: () => void) => pm.test.skip(name, callback));
  const applyVariableChanges = options.applyVariableChanges !== false;
  const context = readScenarioResponseContext(compiled.kind);

  reportResponseBodyKind(compiled, context, reportTest, reportSkippedTest);

  if (compiled.status.length > 0) {
    reportTest(
      `Response returned one of expected statuses: ${compiled.status.join(", ")}`,
      () => {
        pm.expect(context.status).to.be.oneOf(compiled.status);
      },
    );
  }

  if (
    !context.isNoContent &&
    compiled.kind === "json" &&
    !context.bodyParseError
  ) {
    runScenarioAssertions(context.body, compiled.expectations, reportTest);
  }

  if (
    !context.isNoContent &&
    compiled.kind === "sse" &&
    compiled.expectations.events !== null
  ) {
    runScenarioEvents(context.events, compiled.expectations.events, reportTest);
  }

  processScenarioVariables(
    context,
    compiled,
    reportTest,
    applyVariableChanges,
  );

  return {
    response: scenarioResult(context, compiled),
    isNoContent: context.isNoContent,
  };
}

export function reportResponseBodyKind(
  compiled: any,
  context: any,
  reportTest: (name: string, callback: () => void) => void,
  reportSkippedTest: (name: string, callback: () => void) => void,
): void {
  if (compiled.kind !== null && context.isNoContent) {
    reportSkippedTest(
      `Response body contains valid ${
        compiled.kind === "sse" ? "SSE" : "JSON"
      } (skipped for 204 No Content)`,
      () => {},
    );
    return;
  }

  if (compiled.kind === "json") {
    reportTest("Response body contains valid JSON", () => {
      if (context.bodyParseError) {
        throw new Error("Response was not valid JSON.");
      }
    });
    return;
  }

  if (compiled.kind === "sse") {
    reportTest("Response content type is text/event-stream", () => {
      if (normalizeContentType(context.contentType) !== "text/event-stream") {
        throw new Error("Response content type was not text/event-stream.");
      }
    });
  }
}

export function scenarioResult(context: any, compiled: any): any {
  if (context.isNoContent) {
    return null;
  }

  if (compiled.kind === "json") {
    return context.body;
  }

  if (compiled.kind === "sse") {
    return context.events[0]?.data ?? null;
  }

  return null;
}

export function readScenarioResponseContext(kind: string | null): ResponseContext {
  const isNoContent = pm.response.code === 204;
  const contentType = pm.response.headers?.get("Content-Type") || "";
  const context: ResponseContext = {
    status: pm.response.code,
    contentType,
    isNoContent,
    body: null,
    bodyParseError: false,
    events: [],
  };

  if (isNoContent || kind === null) {
    return context;
  }

  if (kind === "json") {
    try {
      context.body = pm.response.json();
    } catch {
      context.bodyParseError = true;
    }
    return context;
  }

  context.events = decodeScenarioSse(pm.response.text());
  return context;
}
