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
