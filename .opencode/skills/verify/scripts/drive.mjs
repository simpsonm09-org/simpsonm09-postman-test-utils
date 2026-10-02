#!/usr/bin/env node
// Drive the postman-test-utils workspace end to end and capture evidence.
//
// Build first, then run from the repository root:
//
//   npm ci && npm run build
//   node .opencode/skills/verify/scripts/drive.mjs --out artifacts/verify/postman-test-utils
//
// The helper starts its own loopback server, copies the example fixtures into a
// scratch directory, drives the built CLI and the public library API, and exits
// non-zero when any expected observation is wrong. The loopback server carries
// no real endpoint and no secret.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../..");
const exampleDir = join(scriptDir, "example");
const cliPath = join(repoRoot, "packages", "postman-test-utils", "dist", "cli.js");
const engineDist = join(repoRoot, "packages", "postman-test-utils", "dist", "index.js");
const secretsDist = join(repoRoot, "packages", "postman-secrets", "dist", "index.js");

// A throwaway fixture value, not a credential. It proves a resolved secret
// reaches newman's in-memory environment and never reaches an emitted file.
const FIXTURE_VALUE = randomUUID();

function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function runCli(args, extraEnv = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function startServer() {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

function healthCollection() {
  return {
    info: { name: "health" },
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
                "pm.test('status is 200', function () { pm.response.to.have.status(200); });",
              ],
            },
          },
        ],
      },
    ],
  };
}

function validatedCollection() {
  const collection = healthCollection();
  collection.item[0].event[0].script.exec = [
    "pm.testUtils.requestValidation.execute({",
    "  SCENARIO: {",
    "    status: { oneOf: [200] },",
    "    response: { kind: 'json', expect: { values: { ok: true } } }",
    "  }",
    "});",
  ];
  return collection;
}

function failingCollection() {
  const collection = healthCollection();
  collection.item[0].event[0].script.exec = [
    "pm.test('always fails', function () { pm.expect(true).to.be.false; });",
  ];
  return collection;
}

// Copy the example fixtures into scratch and point the environment at this
// run's loopback port, so the shipped fixtures stay reusable.
async function writeFixtures(scratch, baseUrl) {
  const collectionPath = join(scratch, "health.postman_collection.json");
  await cp(join(exampleDir, "health.postman_collection.json"), collectionPath);

  const environment = JSON.parse(
    await readFile(join(exampleDir, "local.postman_environment.json"), "utf8"),
  );
  environment.values = environment.values.map((entry) =>
    entry.key === "baseUrl" ? { ...entry, value: baseUrl } : entry,
  );
  const environmentPath = join(scratch, "local.postman_environment.json");
  await writeFile(environmentPath, JSON.stringify(environment, null, 2));

  const configPath = join(scratch, "config.json");
  await writeFile(configPath, JSON.stringify({ collection: collectionPath, environment: environmentPath }));

  const validationConfigPath = join(scratch, "validation-config.json");
  await writeFile(
    validationConfigPath,
    JSON.stringify({
      collection: collectionPath,
      environment: environmentPath,
      validation: { suite: "request-validation" },
    }),
  );

  const failingCollectionPath = join(scratch, "failing.postman_collection.json");
  await writeFile(failingCollectionPath, JSON.stringify(failingCollection(), null, 2));
  const failingConfigPath = join(scratch, "failing-config.json");
  await writeFile(
    failingConfigPath,
    JSON.stringify({ collection: failingCollectionPath, environment: environmentPath }),
  );

  const validatedCollectionPath = join(scratch, "validated.postman_collection.json");
  await writeFile(validatedCollectionPath, JSON.stringify(validatedCollection(), null, 2));
  const validatedConfigPath = join(scratch, "validated-config.json");
  await writeFile(
    validatedConfigPath,
    JSON.stringify({
      collection: validatedCollectionPath,
      environment: environmentPath,
      validation: { suite: "request-validation" },
    }),
  );

  const secretConfigPath = join(scratch, "secret-config.json");
  await writeFile(
    secretConfigPath,
    JSON.stringify({
      collection: collectionPath,
      environment: environmentPath,
      secrets: [{ variable: "token", secret: { provider: "env", name: "PTU_VERIFY_SECRET" } }],
    }),
  );

  return {
    collectionPath,
    environmentPath,
    configPath,
    validationConfigPath,
    failingConfigPath,
    validatedConfigPath,
    secretConfigPath,
  };
}

// The built CLI: help, a passing run, a failing assertion, the validation
// suite, and emit.
async function driveCli(paths, out) {
  const evidence = {};
  const transcript = [];

  const help = await runCli(["--help"]);
  evidence.help = { exitCode: help.code, hasUsage: help.stdout.includes("Usage: postman-test-utils run") };
  transcript.push(`$ node cli.js --help -> exit ${help.code}`);

  const success = await runCli(["run", "--config", paths.configPath]);
  evidence.run_success = { exitCode: success.code, stdout: success.stdout.trim() };
  transcript.push(`$ node cli.js run --config <config> -> exit ${success.code}`);
  transcript.push(success.stdout.trim());

  const failure = await runCli(["run", "--config", paths.failingConfigPath]);
  evidence.run_failure = { exitCode: failure.code, stderr: failure.stderr.trim() };
  transcript.push(`$ node cli.js run --config <failing-config> -> exit ${failure.code}`);
  transcript.push(failure.stderr.trim());

  const validated = await runCli(["run", "--config", paths.validatedConfigPath]);
  evidence.validation_run = {
    exitCode: validated.code,
    stdout: validated.stdout.trim(),
    assertions: Number((validated.stdout.match(/(\d+) assertion\(s\)/) ?? [0, "0"])[1]),
  };
  transcript.push(`$ node cli.js run --config <validated-config> -> exit ${validated.code}`);
  transcript.push(validated.stdout.trim());

  const emittedPath = join(out, "emitted.postman_collection.json");
  const emit = await runCli(["run", "--emit", emittedPath, "--config", paths.validationConfigPath]);
  const emitted = JSON.parse(await readFile(emittedPath, "utf8"));
  const emittedExec = emitted.item[0].event[0].script.exec;
  evidence.emit = {
    exitCode: emit.code,
    stdout: emit.stdout.trim(),
    preludePresent: emittedExec[0].includes("requestValidation"),
    execLines: emittedExec.length,
  };
  transcript.push(`$ node cli.js run --emit <out> --config <config> -> exit ${emit.code}`);
  transcript.push(emit.stdout.trim());

  const emittedSecretPath = join(out, "emitted-secret-free.postman_collection.json");
  const emitSecret = await runCli(["run", "--emit", emittedSecretPath, "--config", paths.secretConfigPath], {
    PTU_VERIFY_SECRET: FIXTURE_VALUE,
  });
  const emittedSecretText = await readFile(emittedSecretPath, "utf8");
  evidence.emit_secret = { exitCode: emitSecret.code, secretAbsent: !emittedSecretText.includes(FIXTURE_VALUE) };
  transcript.push(`$ node cli.js run --emit <out> --config <secret-config> -> exit ${emitSecret.code}`);

  return { evidence, transcript };
}

// The public library API from the built dist: a run, helpers, secrets, and a
// boundary error.
async function driveLibrary(paths, baseUrl) {
  const evidence = {};
  const transcript = [];

  const engine = await import(pathToFileURL(engineDist).href);
  const libraryResult = await engine.runCollection({
    collection: paths.collectionPath,
    environment: { name: "local", values: [{ key: "baseUrl", value: baseUrl, enabled: true }] },
  });
  evidence.library_run = {
    runner: libraryResult.runner,
    success: libraryResult.success,
    requests: libraryResult.stats.requests,
    assertions: libraryResult.stats.assertions,
    failedAssertions: libraryResult.stats.failedAssertions,
  };
  transcript.push(
    `$ runCollection({ collection, environment }) -> success=${libraryResult.success} requests=${libraryResult.stats.requests}`,
  );

  const source = healthCollection();
  const before = JSON.stringify(source);
  const augmented = engine.withHelpers(source, [{ name: "sign", body: "function (payload) { return payload; }" }]);
  const augmentedExec = augmented.item[0].event[0].script.exec;
  evidence.library_withHelpers = {
    mutated: JSON.stringify(source) !== before,
    preludeFirst: augmentedExec[0].includes("helper prelude"),
    hasHelper: augmentedExec[0].includes('"sign"'),
  };
  transcript.push(
    `$ withHelpers(...) -> mutated=${evidence.library_withHelpers.mutated} preludeFirst=${evidence.library_withHelpers.preludeFirst}`,
  );

  process.env.PTU_VERIFY_SECRET = FIXTURE_VALUE;
  const secrets = await import(pathToFileURL(secretsDist).href);
  const resolved = await secrets.resolveSecrets([
    { variable: "token", secret: { provider: "env", name: "PTU_VERIFY_SECRET" } },
  ]);
  const revealed = secrets.reveal(resolved.values.get("token"));
  evidence.library_secrets = {
    matches: revealed === FIXTURE_VALUE,
    isString: typeof revealed === "string",
    bindingScope: resolved.bindings[0].scope,
  };
  transcript.push(
    `$ resolveSecrets + reveal -> matches=${evidence.library_secrets.matches} scope=${evidence.library_secrets.bindingScope}`,
  );

  const secretCollection = healthCollection();
  secretCollection.item[0].event[0].script.exec = [
    `pm.test('token present', function () { pm.expect(pm.environment.get('token')).to.equal('${FIXTURE_VALUE}'); });`,
  ];
  const secretResult = await engine.runCollection({
    collection: secretCollection,
    environment: { name: "local", values: [{ key: "baseUrl", value: baseUrl, enabled: true }] },
    secrets: [{ variable: "token", secret: { provider: "env", name: "PTU_VERIFY_SECRET" } }],
  });
  evidence.library_secret_run = {
    success: secretResult.success,
    failedAssertions: secretResult.stats.failedAssertions,
  };
  transcript.push(
    `$ runCollection({ secrets }) -> success=${secretResult.success} failedAssertions=${secretResult.stats.failedAssertions}`,
  );

  let invalidError = null;
  try {
    await engine.runCollection({ collection: "" });
  } catch (error) {
    invalidError = { name: error.name, field: error.field };
  }
  evidence.library_invalid = invalidError ?? { name: null, field: null };
  transcript.push(
    `$ runCollection({ collection: '' }) -> throws ${evidence.library_invalid.name} at "${evidence.library_invalid.field}"`,
  );

  return { evidence, transcript };
}

function evaluateChecks(evidence) {
  return {
    "help exits 0 with usage": evidence.help?.exitCode === 0 && evidence.help?.hasUsage === true,
    "run success exits 0":
      evidence.run_success?.exitCode === 0 &&
      /newman: 1 iteration\(s\), 1 request\(s\), 1 assertion\(s\), 0 failed/.test(evidence.run_success?.stdout ?? ""),
    "run failure exits 1":
      evidence.run_failure?.exitCode === 1 && (evidence.run_failure?.stderr ?? "").includes("always fails"),
    "validation prelude passes":
      evidence.validation_run?.exitCode === 0 && (evidence.validation_run?.assertions ?? 0) >= 2,
    "emit bakes the prelude":
      evidence.emit?.exitCode === 0 && evidence.emit?.preludePresent === true && (evidence.emit?.execLines ?? 0) >= 2,
    "emit never writes the secret": evidence.emit_secret?.secretAbsent === true,
    "library run succeeds": evidence.library_run?.success === true && evidence.library_run?.requests === 1,
    "library merges the secret":
      evidence.library_secret_run?.success === true && evidence.library_secret_run?.failedAssertions === 0,
    "secret resolves in memory":
      evidence.library_secrets?.matches === true && evidence.library_secrets?.isString === true,
    "withHelpers copies without mutating":
      evidence.library_withHelpers?.mutated === false && evidence.library_withHelpers?.preludeFirst === true,
    "invalid request throws at the boundary":
      evidence.library_invalid?.name === "InvalidRunRequestError" && evidence.library_invalid?.field === "collection",
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const out = resolve(repoRoot, argumentValue(argv, "--out") ?? "artifacts/verify/postman-test-utils");
  await mkdir(out, { recursive: true });
  const scratch = join(out, ".scratch");
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  const transcript = [];
  const evidence = {};
  const server = await startServer();
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const paths = await writeFixtures(scratch, baseUrl);
    const cli = await driveCli(paths, out);
    Object.assign(evidence, cli.evidence);
    transcript.push(...cli.transcript);

    const library = await driveLibrary(paths, baseUrl);
    Object.assign(evidence, library.evidence);
    transcript.push(...library.transcript);
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    transcript.push(`error: ${evidence.error}`);
  } finally {
    server.closeAllConnections?.();
    server.close();
    await rm(scratch, { recursive: true, force: true });
  }

  const checks = evaluateChecks(evidence);
  const passed = Object.values(checks).every(Boolean);

  const report = { passed, checks, evidence };
  await writeFile(join(out, "evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(out, "transcript.txt"), `${transcript.join("\n")}\n`);

  console.log(JSON.stringify(report, null, 2));
  console.log(passed ? "verify: pass" : "verify: FAIL");
  return passed ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
