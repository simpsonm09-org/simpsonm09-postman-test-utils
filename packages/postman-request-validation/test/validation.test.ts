import { describe, expect, it } from "vitest";
import {
  createRequestValidationSuite,
  execute,
  validationHelpers,
} from "../src/index.js";

interface RecordedTest {
  name: string;
  ok: boolean;
  error?: unknown;
}

interface SchemaShape {
  type?: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

function matchesObjectSchema(value: unknown, schema: SchemaShape): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!(key in record)) {
      return false;
    }
  }
  for (const [key, nested] of Object.entries(schema.properties ?? {})) {
    if (key in record && !matchesSchema(record[key], nested)) {
      return false;
    }
  }
  return true;
}

function matchesPrimitiveSchema(
  value: unknown,
  type: string | undefined,
): boolean {
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number") {
    return typeof value === "number";
  }
  return true;
}

function matchesSchema(value: unknown, schema: unknown): boolean {
  if (schema === null || schema === undefined) {
    return true;
  }
  const typed = schema as SchemaShape;
  if (typed.type === "object") {
    return matchesObjectSchema(value, typed);
  }
  return matchesPrimitiveSchema(value, typed.type);
}

function createExpect() {
  function expect(actual: unknown, _message?: string) {
    let negate = false;
    const assert = (ok: boolean): void => {
      const passed = negate ? !ok : ok;
      if (!passed) {
        throw new Error(`expectation failed for ${JSON.stringify(actual)}`);
      }
    };
    const api = {
      equal(expected: unknown) {
        assert(actual === expected);
        return api;
      },
      oneOf(list: readonly unknown[]) {
        assert(list.includes(actual));
        return api;
      },
      match(regex: RegExp) {
        assert(regex.test(String(actual)));
        return api;
      },
      an(kind: string) {
        assert(
          kind === "array" ? Array.isArray(actual) : typeof actual === kind,
        );
        return api;
      },
      jsonSchema(schema: unknown) {
        assert(matchesSchema(actual, schema));
        return api;
      },
    } as Record<string, unknown> & {
      equal: (expected: unknown) => unknown;
      oneOf: (list: readonly unknown[]) => unknown;
      match: (regex: RegExp) => unknown;
      an: (kind: string) => unknown;
      jsonSchema: (schema: unknown) => unknown;
    };
    api.to = api;
    api.be = api;
    api.have = api;
    Object.defineProperty(api, "not", {
      get() {
        negate = !negate;
        return api;
      },
    });
    Object.defineProperty(api, "empty", {
      get() {
        const length = (actual as { length?: number } | null)?.length;
        assert(length === 0);
        return api;
      },
    });
    return api;
  }
  return expect;
}

function createPm(
  options: {
    status?: number;
    body?: unknown;
    text?: string;
    contentType?: string;
  } = {},
) {
  const status = options.status ?? 200;
  const contentType = options.contentType ?? "application/json";
  const body = options.body;
  const text =
    options.text ?? (typeof body === "string" ? body : JSON.stringify(body));
  const environment = new Map<string, unknown>();
  const collectionVariables = new Map<string, unknown>();
  const tests: RecordedTest[] = [];

  const response: Record<string, unknown> = {
    code: status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : undefined,
    },
    json: () => {
      if (typeof body === "string") {
        throw new Error("not json");
      }
      return body;
    },
    text: () => text,
  };
  response.to = {
    have: {
      jsonSchema: (schema: unknown) => {
        if (!matchesSchema(body, schema)) {
          throw new Error("schema mismatch");
        }
      },
    },
  };

  const record = (name: string, callback: () => void): void => {
    try {
      callback();
      tests.push({ name, ok: true });
    } catch (error) {
      tests.push({ name, ok: false, error });
    }
  };
  const test = Object.assign(
    (name: string, callback: () => void) => record(name, callback),
    { skip: (name: string, callback: () => void) => record(name, callback) },
  );

  const pm = {
    response,
    expect: createExpect(),
    test,
    variables: {
      get: (key: string) =>
        environment.get(key) ?? collectionVariables.get(key),
    },
    environment: {
      get: (key: string) => environment.get(key),
      set: (key: string, value: unknown) => environment.set(key, value),
    },
    collectionVariables: {
      get: (key: string) => collectionVariables.get(key),
      set: (key: string, value: unknown) => collectionVariables.set(key, value),
      unset: (key: string) => collectionVariables.delete(key),
    },
    info: { requestName: "test-request" },
    execution: { setNextRequest: () => {} },
  };

  return { pm, tests, environment, collectionVariables };
}

describe("request-validation suite", () => {
  it("passes status and value expectations", () => {
    const { pm, tests } = createPm({ body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        status: { oneOf: [200] },
        response: { kind: "json", expect: { values: { ok: true } } },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
    expect(
      tests.some((test) => test.name.includes("one of expected statuses")),
    ).toBe(true);
  });

  it("fails a mismatched value", () => {
    const { pm, tests } = createPm({ body: { ok: false } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "json", expect: { values: { ok: true } } },
      },
    });
    expect(tests.some((test) => !test.ok)).toBe(true);
  });

  it("checks regex and array contains", () => {
    const { pm, tests } = createPm({
      body: {
        id: "abc-123",
        statuses: [{ status: "CREATED", source: "API" }],
      },
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "json",
          expect: {
            regex: { id: /^[0-9a-z-]+$/i },
            arrays: { statuses: [{ status: "CREATED" }] },
          },
        },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("decodes and validates SSE events", () => {
    const { pm, tests } = createPm({
      contentType: "text/event-stream",
      text: 'event: link-status\ndata: {"linkId":"1","status":"AUTHORIZED"}\n\n',
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "sse",
          expect: {
            events: [
              {
                name: "link-status",
                data: { values: { linkId: "1", status: "AUTHORIZED" } },
              },
            ],
          },
        },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("saves response values into the environment", () => {
    const { pm, environment } = createPm({
      body: { linkRoot: { linkId: "abc" } },
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "json", expect: {} },
        variables: {
          save: [
            {
              scope: "environment",
              variable: "linkId",
              source: "linkRoot.linkId",
            },
          ],
        },
      },
    });
    expect(environment.get("linkId")).toBe("abc");
  });

  it("reports an invalid configuration as a failing test", () => {
    const { pm, tests } = createPm();
    (globalThis as { pm?: unknown }).pm = pm;
    const result = createRequestValidationSuite().execute({
      SCENARIO: { status: { oneOf: [] } },
    });
    expect(tests).toEqual([
      expect.objectContaining({
        name: "SCENARIO configuration is valid",
        ok: false,
      }),
    ]);
    expect(result.isNoContent).toBe(false);
  });

  it("rejects a scenario that defines both arrays and arrayContains", () => {
    const { pm, tests } = createPm();
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "json",
          expect: { arrays: {}, arrayContains: {} },
        },
      },
    });
    expect(tests).toEqual([
      expect.objectContaining({
        name: "SCENARIO configuration is valid",
        ok: false,
      }),
    ]);
  });

  it("rejects malformed variable actions", () => {
    const scenarios = [
      { variables: { save: [42] } },
      { variables: { save: [{ scope: "bad", variable: "id" }] } },
      {
        variables: {
          save: [{ scope: "environment", variable: "id", name: "other" }],
        },
      },
      { variables: { save: [{ scope: "environment", variable: "  " }] } },
    ];

    for (const scenario of scenarios) {
      const { pm, tests } = createPm();
      (globalThis as { pm?: unknown }).pm = pm;
      createRequestValidationSuite().execute({
        SCENARIO: { response: { kind: "json", expect: {} }, ...scenario },
      });
      expect(tests).toEqual([
        expect.objectContaining({
          name: "SCENARIO configuration is valid",
          ok: false,
        }),
      ]);
    }
  });

  it("validates variable save sources", () => {
    const configs = [
      {
        SCENARIO: {
          response: { kind: "json", expect: {} },
          variables: {
            save: [{ scope: "environment", variable: "id", source: "" }],
          },
        },
      },
      {
        SCENARIO: {
          variables: {
            save: [{ scope: "environment", variable: "id", source: "a.b" }],
          },
        },
      },
      {
        SCENARIO: {
          response: { kind: "sse", expect: {} },
          variables: {
            save: [{ scope: "environment", variable: "id", source: "a.b" }],
          },
        },
      },
      {
        SCENARIO: {
          response: { kind: "json", expect: {} },
          variables: {
            save: [
              {
                scope: "environment",
                variable: "id",
                source: { event: 0, data: "id" },
              },
            ],
          },
        },
      },
    ];

    for (const config of configs) {
      const { pm, tests } = createPm();
      (globalThis as { pm?: unknown }).pm = pm;
      createRequestValidationSuite().execute(config);
      expect(tests).toEqual([
        expect.objectContaining({
          name: "SCENARIO configuration is valid",
          ok: false,
        }),
      ]);
    }
  });

  it("skips body validation for 204 No Content", () => {
    const { pm, tests } = createPm({ status: 204 });
    (globalThis as { pm?: unknown }).pm = pm;
    const result = createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
    });
    expect(result).toEqual({ response: null, isNoContent: true });
    expect(tests.some((test) => test.name.includes("skipped for 204"))).toBe(
      true,
    );
  });

  it("returns a null response when no response block is configured", () => {
    const { pm } = createPm({ body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = pm;
    const result = createRequestValidationSuite().execute({
      SCENARIO: { status: { oneOf: [200] } },
    });
    expect(result.response).toBeNull();
    expect(result.isNoContent).toBe(false);
  });

  it("reports invalid JSON and non-SSE content types", () => {
    const invalidJson = createPm({ body: "not-json" });
    (globalThis as { pm?: unknown }).pm = invalidJson.pm;
    createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
    });
    expect(invalidJson.tests.some((test) => !test.ok)).toBe(true);

    const wrongContentType = createPm({
      contentType: "application/json",
      text: "",
    });
    (globalThis as { pm?: unknown }).pm = wrongContentType.pm;
    createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "sse", expect: {} } },
    });
    expect(wrongContentType.tests.some((test) => !test.ok)).toBe(true);
  });

  it("parses SSE comments, ids, retries, and malformed frames", () => {
    const { pm, tests } = createPm({
      contentType: "text/event-stream",
      text:
        ': keep-alive\nid: 7\nretry: 1500\ndata: {"ok":true}\n\n' +
        "event: ping\n\n" +
        "data: not-json\n\n",
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "sse",
          expect: {
            events: [
              { name: "message", data: { values: { ok: true } } },
              { name: "ping", data: {} },
              { data: {} },
            ],
          },
        },
      },
    });
    expect(
      tests.some((test) => test.name.includes("SSE response contains")),
    ).toBe(true);
  });

  it("evaluates array item matchers", () => {
    const { pm, tests } = createPm({
      body: {
        items: [null, { id: "42", name: "  " }, { id: "7" }, { name: "x" }],
      },
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "json",
          expect: {
            arrays: { items: [{ id: /^\d+$/ }, { name: "x" }] },
          },
        },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("validates retry-on-with-polling configuration", () => {
    const invalidRetries = [
      { statuses: [500], attempts: 0, delayMs: 100 },
      { statuses: [500], attempts: 2, delayMs: -1 },
      { statuses: [500], attempts: 2, delayMs: 100, backoff: {} },
      { statuses: [500], attempts: 2, delayMs: 100, shouldRetry: "nope" },
    ];

    for (const retry of invalidRetries) {
      const { pm, tests } = createPm({ body: { ok: true } });
      (globalThis as { pm?: unknown }).pm = pm;
      createRequestValidationSuite().execute({
        SCENARIO: { response: { kind: "json", expect: {} } },
        RETRY_ON_WITH_POLLING: retry,
      });
      expect(tests.some((test) => !test.ok)).toBe(false);
    }

    const valid = createPm({ body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = valid.pm;
    createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
      RETRY_ON_WITH_POLLING: {
        statuses: [500],
        attempts: 2,
        delayMs: 100,
        backoff: { multiplier: 2, maxDelayMs: 500 },
      },
    });
    expect(valid.tests.some((test) => !test.ok)).toBe(false);
  });

  it("exposes execute as a convenience export", () => {
    expect(typeof execute).toBe("function");
  });
});

describe("validationHelpers", () => {
  it("returns a self-contained, evaluable prelude body", () => {
    const helpers = validationHelpers();
    expect(helpers).toHaveLength(1);
    expect(helpers[0].name).toBe("requestValidation");
    expect(helpers[0].body).not.toContain("node:");

    const pm = { test: () => {}, testUtils: undefined };
    const evaluate = new Function("pm", `return ${helpers[0].body};`) as (
      pm: unknown,
    ) => { execute: unknown };
    const suite = evaluate(pm);
    expect(typeof suite.execute).toBe("function");
  });
});

describe("request-validation coverage paths", () => {
  it("resolves an expected value from a variable", () => {
    const { pm, tests, environment } = createPm({ body: { token: "abc" } });
    environment.set("saved", "abc");
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "json",
          expect: { values: { token: { variable: "saved" } } },
        },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("checks a forbidden value", () => {
    const { pm, tests } = createPm({ body: { state: "open" } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "json", expect: { notValues: { state: "closed" } } },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("validates a JSON schema", () => {
    const { pm, tests } = createPm({ body: { id: "1" } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "json",
          expect: { schema: { type: "object", required: ["id"] } },
        },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("validates a schema inside an SSE event", () => {
    const { pm, tests } = createPm({
      contentType: "text/event-stream",
      text: 'data: {"id":"1"}\n\n',
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: {
          kind: "sse",
          expect: {
            events: [
              { data: { schema: { type: "object", required: ["id"] } } },
            ],
          },
        },
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("clears environment and collection variables", () => {
    const { pm, environment, collectionVariables } = createPm({
      body: { ok: true },
    });
    environment.set("e", "x");
    collectionVariables.set("c", "y");
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "json", expect: {} },
        variables: {
          clear: [
            { scope: "environment", variable: "e" },
            { scope: "collection", variable: "c" },
          ],
        },
      },
    });
    expect(environment.get("e")).toBe("");
    expect(collectionVariables.get("c")).toBe("");
  });

  it("saves a value from an SSE event", () => {
    const { pm, environment } = createPm({
      contentType: "text/event-stream",
      text: 'event: link\ndata: {"ref":"r1"}\n\n',
    });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "sse", expect: { events: [{ data: {} }] } },
        variables: {
          save: [
            {
              scope: "environment",
              variable: "ref",
              source: { event: 0, data: "ref" },
            },
          ],
        },
      },
    });
    expect(environment.get("ref")).toBe("r1");
  });

  it("runs through the execute convenience export", () => {
    const { pm } = createPm({ body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = pm;
    const result = execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
    });
    expect(result.isNoContent).toBe(false);
  });

  it("re-queues when shouldRetry returns true", async () => {
    const { pm, collectionVariables } = createPm({
      status: 500,
      body: { ok: true },
    });
    let scheduled: unknown = null;
    pm.execution.setNextRequest = (...args: unknown[]) => {
      scheduled = args[0] ?? null;
    };
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
      RETRY_ON_WITH_POLLING: {
        statuses: [500],
        attempts: 2,
        delayMs: 1,
        backoff: { multiplier: 2, maxDelayMs: 5 },
        shouldRetry: () => true,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(scheduled).toBe("test-request");
    expect(
      collectionVariables.get("__request_validation_attempt_test-request"),
    ).toBe(1);
  });

  it("stops when shouldRetry returns false", () => {
    const { pm, tests } = createPm({ status: 500, body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
      RETRY_ON_WITH_POLLING: {
        statuses: [500],
        attempts: 2,
        delayMs: 1,
        shouldRetry: () => false,
      },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("reports a failing shouldRetry callback", () => {
    const { pm, tests } = createPm({ status: 500, body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: { response: { kind: "json", expect: {} } },
      RETRY_ON_WITH_POLLING: {
        statuses: [500],
        attempts: 2,
        delayMs: 1,
        shouldRetry: () => {
          throw new Error("boom");
        },
      },
    });
    expect(
      tests.some(
        (test) =>
          test.name === "RETRY_ON_WITH_POLLING.shouldRetry failed" && !test.ok,
      ),
    ).toBe(true);
  });

  it("re-queues a failing dry run without shouldRetry", async () => {
    const { pm } = createPm({ status: 500, body: { ok: false } });
    let scheduled: unknown = null;
    pm.execution.setNextRequest = (...args: unknown[]) => {
      scheduled = args[0] ?? null;
    };
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "json", expect: { values: { ok: true } } },
      },
      RETRY_ON_WITH_POLLING: { statuses: [500], attempts: 2, delayMs: 0 },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(scheduled).toBe("test-request");
  });

  it("stops when the dry run passes and no shouldRetry is set", () => {
    const { pm, tests } = createPm({ status: 500, body: { ok: true } });
    (globalThis as { pm?: unknown }).pm = pm;
    createRequestValidationSuite().execute({
      SCENARIO: {
        response: { kind: "json", expect: { values: { ok: true } } },
      },
      RETRY_ON_WITH_POLLING: { statuses: [500], attempts: 2, delayMs: 1 },
    });
    expect(tests.every((test) => test.ok)).toBe(true);
  });

  it("rejects invalid scenario shapes", () => {
    const configs: unknown[] = [
      null,
      { SCENARIO: null },
      { SCENARIO: {}, NOPE: true },
      { SCENARIO: { response: 1 } },
      { SCENARIO: { response: { kind: "xml" } } },
      { SCENARIO: { status: 1 } },
      { SCENARIO: { response: { kind: "json", expect: 1 } } },
      { SCENARIO: { response: { kind: "json", expect: { events: [] } } } },
      { SCENARIO: { response: { kind: "json", expect: { schema: 1 } } } },
      { SCENARIO: { response: { kind: "json", expect: { values: 1 } } } },
      {
        SCENARIO: {
          response: { kind: "json", expect: { values: { "": 1 } } },
        },
      },
      {
        SCENARIO: {
          response: { kind: "json", expect: { arrays: { list: 1 } } },
        },
      },
      { SCENARIO: { response: { kind: "sse", expect: { events: 1 } } } },
      { SCENARIO: { response: { kind: "sse", expect: { events: [1] } } } },
      {
        SCENARIO: {
          response: { kind: "sse", expect: { events: [{ name: "" }] } },
        },
      },
      {
        SCENARIO: {
          response: { kind: "sse", expect: { events: [{ data: 1 }] } },
        },
      },
      { SCENARIO: { variables: 1 } },
      { SCENARIO: { variables: { save: 1 } } },
    ];

    for (const config of configs) {
      const { pm, tests } = createPm({ body: { ok: true } });
      (globalThis as { pm?: unknown }).pm = pm;
      createRequestValidationSuite().execute(config);
      expect(tests).toEqual([
        expect.objectContaining({
          name: "SCENARIO configuration is valid",
          ok: false,
        }),
      ]);
    }
  });
});
