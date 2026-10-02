# Installed-layout smoke

The workspace smoke test assembles a consumer `node_modules` by hand the way npm would after publish, symlinks newman, and runs the built CLI against a local server. It proves the package graph, the exports map, the bin, and the validation prelude outside the workspace without a registry.

## Sub-features

- `smoke-layout` copies each package's `package.json` and `dist` into a temp consumer tree.
- `smoke-bin` runs the installed `postman-test-utils` `dist/cli.js`.
- `smoke-exports` resolves `@simpsonm09/postman-secrets` and `@simpsonm09/postman-request-validation` from the assembled layout.
- `smoke-prelude` runs a collection that calls `pm.testUtils.requestValidation.execute`.
- `smoke-exit` prints `installed-layout exit code: 0` on success.

## How to get to it (user POV)

- From the repository root, run `just smoke`, or `npm run smoke`, which builds first.
- Read the printed `installed-layout exit code:` and the newman summary line.
- It needs no registry and no network beyond the loopback server it starts.

## Driving it with the node helper and the built CLI

Preconditions:

- The workspace is installed with `npm ci`.
- The build is current; `just smoke` rebuilds first.

- **Run it.** Run `just smoke` from the repository root. A passing run prints `installed-layout exit code: 0` and a `newman: 1 iteration(s), 1 request(s), 3 assertion(s), 0 failed` summary.
- **Assert the code.** The smoke script exits non-zero when the CLI exits non-zero, so a green `just smoke` is the proof.
- **Proof.** Capture the command and its full output under `artifacts/verify/smoke-install/`. The smoke script cleans up its own temp directory, so the transcript is the artifact to keep.

## Gotchas

- The smoke test writes to the OS temp directory (`ptu-smoke-install`) and removes it first. It does not touch the workspace.
- It symlinks newman from the workspace `node_modules`, so run it after `npm ci`.
- It builds before assembling, so a stale `dist` is overwritten.
- A failure prints the CLI stderr; read both the exit code line and the stderr.
- The installed layout is the publish shape. A green unit suite does not prove the exports map or the bin resolve outside the workspace; this does.
