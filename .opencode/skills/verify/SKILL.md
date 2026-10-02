---
name: verify
description: Drive the postman-test-utils workspace the way a user does, running Postman v2.1 collections offline through the built CLI (`run`, `--config`, `--emit`) and the public library API of the three packages, plus the installed-layout smoke test. Use when verifying a change to the engine, the CLI, the secret providers, the validation suite, or the installed package graph.
---

# Verify postman-test-utils

postman-test-utils is an npm-workspaces monorepo that runs Postman v2.1 collections offline through newman, resolves secrets in memory, and validates responses with one shared suite. The user-facing surfaces are the CLI at `packages/postman-test-utils/dist/cli.js` (`run`, `--config`, `--emit`), the public library API of `postman-test-utils`, `@simpsonm09/postman-secrets`, and `@simpsonm09/postman-request-validation`, and the installed-layout check `just smoke`. This skill builds the workspace, starts a loopback server, drives the CLI and the library, and captures proof.

## Launch

Run from the repository root. Install with the lockfile, then build every package:

```bash
npm ci
npm run build
```

`npm ci` needs the `node_modules` the workspace already uses. `newman` is an optional peer dependency installed here as a dev dependency, so an offline run works. The build is ready when the CLI exists:

```bash
node -e "const fs=require('node:fs');const p='packages/postman-test-utils/dist/cli.js';if(!fs.existsSync(p)){throw new Error('missing '+p)}console.log('ready: '+p)"
```

There is no long-running process to keep alive. The drive helper starts its own loopback HTTP server on an ephemeral port and closes it when it finishes. For teardown, let the helper close the server; never kill by process name or port.

## Doctor

One read-only check that decides whether the build is worth driving:

```bash
node -e "const fs=require('node:fs');const {execFileSync}=require('node:child_process');const cli='packages/postman-test-utils/dist/cli.js';if(!fs.existsSync(cli)){console.error('not built: '+cli);process.exit(1)}const out=execFileSync(process.execPath,[cli,'--help'],{encoding:'utf8'});if(!out.includes('--config')){console.error('unexpected help output');process.exit(1)}console.log('doctor: cli.js present, --help exits 0')"
```

If it fails, stop and re-run Launch rather than driving a stale or missing build.

## Drive

Run the shipped helper from the repository root after Launch:

```bash
node .opencode/skills/verify/scripts/drive.mjs --out artifacts/verify/postman-test-utils
```

The helper starts a loopback server, copies the example fixtures into a scratch directory, then drives every mapped surface through the built artifacts:

- `--help` and a passing `run --config`, asserting the newman summary line and exit `0`.
- A failing assertion, asserting exit `1` and the failure on stderr.
- `run --config` with `validation: { suite: "request-validation" }`, asserting the injected prelude ran.
- `run --emit`, asserting the written collection carries the prelude and no resolved secret.
- The library API from `dist`: `runCollection`, `withHelpers`, secret merge, and the `InvalidRunRequestError` boundary.
- `@simpsonm09/postman-secrets`: `resolveSecrets` and `reveal` on the `env` provider.

It writes `evidence.json` and `transcript.txt` and exits non-zero when any expected observation is wrong.

For a hand-run that needs no server, bake the prelude from the example config:

```bash
node packages/postman-test-utils/dist/cli.js run --emit artifacts/verify/postman-test-utils/emitted.json --config .opencode/skills/verify/scripts/example/postman-test-utils.config.json
```

The installed-layout check is the workspace smoke test:

```bash
just smoke
```

It builds, assembles `node_modules` by hand the way npm would after publish, and runs the CLI against a local server. A passing run prints `installed-layout exit code: 0`.

## Evidence

Proof artifacts go to `artifacts/verify/<feature>/` and survive teardown. `artifacts/` is gitignored. The helper writes `evidence.json` (every observation and the pass/fail checks) and `transcript.txt` (the commands and their real output). `emitted.postman_collection.json` and `emitted-secret-free.postman_collection.json` are the `--emit` proof files.

- Exercise the real user path: the built CLI and the public API from `dist`, not internal test helpers or `src` imports.
- Capture the action and the result. The passing run records the newman summary line and the exit code; the failing run records both the exit code and the stderr line.
- Verify side effects. An `--emit` change is proven by reading the written collection and checking the prelude line and the absence of the fixture secret, not by the exit code alone.
- A secret is proven resolved only through `reveal` and through a run whose test asserts the in-memory environment value.
- A failing run proves the failure path, which the unit suite does not cover through the CLI.

## Cleanup

The helper closes its own loopback server and removes its scratch directory before it writes evidence, so nothing is left running. Cleanup removes the instance and scratch state, never the proof. `artifacts/verify/` stays in place.

## Helpers

`scripts/drive.mjs` is the driver. It accepts `--out` (default `artifacts/verify/postman-test-utils`), starts and stops its own loopback server, prints the evidence report as JSON, and returns non-zero on a failed assertion. It reads the fixtures in `scripts/example/`, so the hand-run command and the helper drive the same collection, environment, and config. The example environment points at a loopback URL (`http://127.0.0.1:4310`); the helper rewrites the port to the one it actually started. No fixture carries a real endpoint or a secret.
