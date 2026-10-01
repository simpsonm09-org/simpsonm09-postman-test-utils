// Assemble the installed layout by hand, the way npm would after publish, and
// run the CLI against a local server. Proves the package graph, the exports
// map, the bin, and the validation prelude work outside the workspace without a
// registry. Run `npm run smoke`.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const consumer = join(tmpdir(), "ptu-smoke-install");
const cli = join(consumer, "node_modules", "postman-test-utils", "dist", "cli.js");

async function installPackage(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  await cp(join(sourceDir, "package.json"), join(targetDir, "package.json"));
  await cp(join(sourceDir, "dist"), join(targetDir, "dist"), { recursive: true });
}

function runCli(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

await rm(consumer, { recursive: true, force: true });
await mkdir(join(consumer, "node_modules", "@simpsonm09"), { recursive: true });

await installPackage(
  join(repo, "packages", "postman-test-utils"),
  join(consumer, "node_modules", "postman-test-utils"),
);
await installPackage(
  join(repo, "packages", "postman-secrets"),
  join(consumer, "node_modules", "@simpsonm09", "postman-secrets"),
);
await installPackage(
  join(repo, "packages", "postman-request-validation"),
  join(consumer, "node_modules", "@simpsonm09", "postman-request-validation"),
);

// newman resolves through a junction to the workspace copy, including its own
// transitive dependencies via realpath.
await symlink(
  join(repo, "node_modules", "newman"),
  join(consumer, "node_modules", "newman"),
  "junction",
);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const collectionPath = join(consumer, "collection.json");
await writeFile(
  collectionPath,
  JSON.stringify({
    info: { name: "installed" },
    item: [
      {
        name: "health",
        request: { method: "GET", url: "{{baseUrl}}/health" },
        event: [
          {
            listen: "test",
            script: {
              type: "text/javascript",
              exec: [
                "pm.testUtils.requestValidation.execute({ SCENARIO: { status: { oneOf: [200] }, response: { kind: 'json', expect: { values: { ok: true } } } } });",
              ],
            },
          },
        ],
      },
    ],
  }),
);
const environmentPath = join(consumer, "environment.json");
await writeFile(
  environmentPath,
  JSON.stringify({
    name: "local",
    values: [{ key: "baseUrl", value: baseUrl, enabled: true }],
  }),
);
const configPath = join(consumer, "config.json");
await writeFile(
  configPath,
  JSON.stringify({
    collection: collectionPath,
    environment: environmentPath,
    validation: { suite: "request-validation" },
  }),
);

const result = await runCli(["run", "--config", configPath], consumer);
console.log("installed-layout exit code:", result.code);
console.log(result.stdout.trim());
if (result.code !== 0) {
  console.error(result.stderr.trim());
}

server.closeAllConnections?.();
server.close();
process.exit(result.code === 0 ? 0 : 1);
