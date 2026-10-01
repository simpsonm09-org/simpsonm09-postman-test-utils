import { describe, expect, it } from "vitest";
import { InvalidRunRequestError } from "../src/errors.js";
import { normalizeRunRequest } from "../src/normalize.js";

describe("normalizeRunRequest", () => {
  it("accepts a collection path", () => {
    expect(normalizeRunRequest({ collection: "./c.json" }).collection).toBe(
      "./c.json",
    );
  });

  it("accepts a collection object with an item array", () => {
    const collection = { info: { name: "x" }, item: [] };
    expect(normalizeRunRequest({ collection }).collection).toEqual(collection);
  });

  it("rejects a collection object without an item array", () => {
    expect(() =>
      normalizeRunRequest({ collection: { info: { name: "x" } } }),
    ).toThrow(InvalidRunRequestError);
  });

  it("rejects an empty collection path", () => {
    expect(() => normalizeRunRequest({ collection: "   " })).toThrow(
      InvalidRunRequestError,
    );
  });

  it("rejects a request that is not an object", () => {
    expect(() => normalizeRunRequest(null)).toThrow(InvalidRunRequestError);
  });

  it("rejects a non-positive timeout", () => {
    expect(() =>
      normalizeRunRequest({ collection: "./c.json", timeoutRequestMs: 0 }),
    ).toThrow(InvalidRunRequestError);
  });

  it("rejects an environment object without a values array", () => {
    expect(() =>
      normalizeRunRequest({
        collection: "./c.json",
        environment: { name: "x" },
      }),
    ).toThrow(InvalidRunRequestError);
  });

  it("accepts an env secret binding", () => {
    const normalized = normalizeRunRequest({
      collection: "./c.json",
      secrets: [
        { variable: "token", secret: { provider: "env", name: "TOKEN" } },
      ],
    });
    expect(normalized.secrets).toEqual([
      { variable: "token", secret: { provider: "env", name: "TOKEN" } },
    ]);
  });

  it("accepts a vault secret binding with a scope", () => {
    const normalized = normalizeRunRequest({
      collection: "./c.json",
      secrets: [
        {
          variable: "token",
          scope: "globals",
          secret: { provider: "vault", path: "secret/data/ci", field: "token" },
        },
      ],
    });
    expect(normalized.secrets[0].scope).toBe("globals");
  });

  it("rejects an unknown secret provider", () => {
    expect(() =>
      normalizeRunRequest({
        collection: "./c.json",
        secrets: [{ variable: "x", secret: { provider: "gcp", name: "x" } }],
      }),
    ).toThrow(InvalidRunRequestError);
  });

  it("accepts the validation request", () => {
    const normalized = normalizeRunRequest({
      collection: "./c.json",
      validation: { suite: "request-validation", listeners: ["test"] },
    });
    expect(normalized.validation).toEqual({
      suite: "request-validation",
      listeners: ["test"],
    });
  });

  it("rejects an unknown validation suite", () => {
    expect(() =>
      normalizeRunRequest({
        collection: "./c.json",
        validation: { suite: "other" },
      }),
    ).toThrow(InvalidRunRequestError);
  });
});
