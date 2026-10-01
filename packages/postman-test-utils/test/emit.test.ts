import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emitCollection } from "../src/run.js";
import type { PostmanCollection } from "../src/types.js";

const collection: PostmanCollection = {
  info: { name: "emit" },
  item: [
    {
      name: "health",
      request: { method: "GET", url: "{{baseUrl}}/health" },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: ["pm.test('ok', function () {});"],
          },
        },
      ],
    },
  ],
};

async function emitPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ptu-emit-"));
  return join(directory, "collection.json");
}

describe("emitCollection", () => {
  afterEach(() => {
    delete process.env.PTU_EMIT_SECRET;
  });

  it("bakes the validation prelude into the written collection", async () => {
    const path = await emitPath();
    await emitCollection(
      { collection, validation: { suite: "request-validation" } },
      path,
    );
    const written = JSON.parse(
      await readFile(path, "utf8"),
    ) as PostmanCollection;
    const exec = written.item[0].event?.[0].script?.exec ?? [];
    expect(exec[0]).toContain("requestValidation");
    expect(exec[1]).toBe("pm.test('ok', function () {});");
  });

  it("never writes a resolved secret value", async () => {
    process.env.PTU_EMIT_SECRET = "do-not-write";
    const path = await emitPath();
    await emitCollection(
      {
        collection,
        secrets: [
          {
            variable: "token",
            secret: { provider: "env", name: "PTU_EMIT_SECRET" },
          },
        ],
      },
      path,
    );
    expect(await readFile(path, "utf8")).not.toContain("do-not-write");
  });

  it("writes a plain collection when validation is not requested", async () => {
    const path = await emitPath();
    await emitCollection({ collection }, path);
    const written = JSON.parse(
      await readFile(path, "utf8"),
    ) as PostmanCollection;
    expect(written.item[0].event?.[0].script?.exec).toEqual([
      "pm.test('ok', function () {});",
    ]);
  });
});
