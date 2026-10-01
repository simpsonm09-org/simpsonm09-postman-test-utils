import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runCollection } from "../src/run.js";
import type { PostmanCollection } from "../src/types.js";

const fixtureUrl = new URL(
  "./fixtures/health.postman_collection.json",
  import.meta.url,
);

async function loadCollection(): Promise<PostmanCollection> {
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as PostmanCollection;
}

function collectionWithTest(script: string): PostmanCollection {
  return {
    info: { name: "inline" },
    item: [
      {
        name: "health",
        request: { method: "GET", url: "{{baseUrl}}/health" },
        event: [
          {
            listen: "test",
            script: { type: "text/javascript", exec: [script] },
          },
        ],
      },
    ],
  };
}

describe("runCollection with newman", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (request.url === "/events") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          'event: link-status\ndata: {"linkId":"1","status":"AUTHORIZED"}\n\n',
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  afterEach(() => {
    delete process.env.PTU_TEST_TOKEN;
  });

  function environment() {
    return {
      name: "local",
      values: [{ key: "baseUrl", value: baseUrl, enabled: true }],
    };
  }

  it("runs a collection and reports a passing assertion", async () => {
    const result = await runCollection({
      collection: await loadCollection(),
      environment: environment(),
    });
    expect(result.runner).toBe("newman");
    expect(result.success).toBe(true);
    expect(result.stats.requests).toBe(1);
    expect(result.stats.assertions).toBe(1);
    expect(result.stats.failedAssertions).toBe(0);
  });

  it("reports a failed assertion without throwing", async () => {
    const collection = await loadCollection();
    collection.item[0].event![0].script!.exec = [
      "pm.test('always fails', function () { pm.expect(true).to.be.false; });",
    ];
    const result = await runCollection({
      collection,
      environment: environment(),
    });
    expect(result.success).toBe(false);
    expect(result.stats.failedAssertions).toBe(1);
    expect(result.failures[0].test).toBe("always fails");
    expect(result.failures[0].message).toContain("expected true to be false");
  });

  it("injects the request-validation suite as a prelude", async () => {
    const collection = collectionWithTest(
      [
        "pm.testUtils.requestValidation.execute({",
        "  SCENARIO: {",
        "    status: { oneOf: [200] },",
        "    response: { kind: 'json', expect: { values: { ok: true } } }",
        "  }",
        "});",
      ].join("\n"),
    );
    const result = await runCollection({
      collection,
      environment: environment(),
      validation: { suite: "request-validation" },
    });
    expect(result.success).toBe(true);
    expect(result.stats.assertions).toBeGreaterThanOrEqual(2);
  });

  it("reads a collection file when validation is requested", async () => {
    const result = await runCollection({
      collection: fileURLToPath(fixtureUrl),
      environment: environment(),
      validation: { suite: "request-validation" },
    });
    expect(result.success).toBe(true);
  });

  it("validates a real text/event-stream response through the prelude", async () => {
    const collection: PostmanCollection = {
      info: { name: "sse" },
      item: [
        {
          name: "events",
          request: { method: "GET", url: "{{baseUrl}}/events" },
          event: [
            {
              listen: "test",
              script: {
                type: "text/javascript",
                exec: [
                  "pm.testUtils.requestValidation.execute({",
                  "  SCENARIO: {",
                  "    status: { oneOf: [200] },",
                  "    response: {",
                  "      kind: 'sse',",
                  "      expect: {",
                  "        events: [",
                  "          { name: 'link-status', data: { values: { linkId: '1', status: 'AUTHORIZED' } } }",
                  "        ]",
                  "      }",
                  "    }",
                  "  }",
                  "});",
                ],
              },
            },
          ],
        },
      ],
    };
    const result = await runCollection({
      collection,
      environment: environment(),
      validation: { suite: "request-validation" },
    });
    expect(result.success).toBe(true);
  });

  it("merges resolved secrets into the environment without writing them to disk", async () => {
    process.env.PTU_TEST_TOKEN = "s3cr3t-value";
    const collection = collectionWithTest(
      "pm.test('token present', function () { pm.expect(pm.environment.get('token')).to.equal('s3cr3t-value'); });",
    );
    const result = await runCollection({
      collection,
      environment: environment(),
      secrets: [
        {
          variable: "token",
          secret: { provider: "env", name: "PTU_TEST_TOKEN" },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stats.failedAssertions).toBe(0);
  });
});
