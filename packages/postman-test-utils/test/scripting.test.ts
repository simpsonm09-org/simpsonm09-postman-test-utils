import { describe, expect, it } from "vitest";
import { buildHelperPrelude, withHelpers } from "../src/scripting.js";
import type { PostmanCollection } from "../src/types.js";

const helper = { name: "sign", body: "function (input) { return input; }" };

function makeCollection(): PostmanCollection {
  return {
    info: { name: "c" },
    item: [
      {
        name: "req",
        request: { method: "GET", url: "{{baseUrl}}/x" },
        event: [
          { listen: "test", script: { exec: ["pm.test('a', function () {});"] } },
          { listen: "prerequest", script: { exec: ["console.log('pre');"] } },
        ],
      },
      {
        name: "folder",
        item: [
          {
            name: "nested",
            event: [
              { listen: "test", script: { exec: ["pm.test('nested', function () {});"] } },
            ],
          },
        ],
      },
    ],
  };
}

describe("buildHelperPrelude", () => {
  it("registers each helper on pm.testUtils", () => {
    expect(buildHelperPrelude([helper])).toContain('pm.testUtils["sign"]');
  });

  it("returns an empty string when there are no helpers", () => {
    expect(buildHelperPrelude([])).toBe("");
  });

  it("rejects a helper name that is not a JavaScript identifier", () => {
    expect(() => buildHelperPrelude([{ name: "bad-name", body: "1" }])).toThrow();
  });
});

describe("withHelpers", () => {
  it("prepends the prelude to matching events and keeps the originals", () => {
    const augmented = withHelpers(makeCollection(), [helper]);
    const events = augmented.item[0].event ?? [];
    expect(events[0].script?.exec[0]).toContain("helper prelude");
    expect(events[0].script?.exec[1]).toBe("pm.test('a', function () {});");
    expect(events[1].script?.exec[0]).toContain("helper prelude");
  });

  it("visits nested folder items", () => {
    const augmented = withHelpers(makeCollection(), [helper]);
    const nested = augmented.item[1].item?.[0].event ?? [];
    expect(nested[0].script?.exec[0]).toContain("helper prelude");
  });

  it("does not mutate the input collection", () => {
    const collection = makeCollection();
    withHelpers(collection, [helper]);
    expect(collection.item[0].event?.[0].script?.exec).toEqual([
      "pm.test('a', function () {});",
    ]);
  });

  it("leaves listeners that were not requested alone", () => {
    const augmented = withHelpers(makeCollection(), [helper], ["test"]);
    expect(augmented.item[0].event?.[1].script?.exec).toEqual(["console.log('pre');"]);
  });
});
