# postman-test-utils verification map

This directory is the maintained source for verifying the user-facing behavior of postman-test-utils. Read the index before driving the workspace, then use the matching feature file as the recipe.

## Baseline preconditions

- Install and build from the repository root (see the skill's Launch section): `npm ci && npm run build`.
- Confirm the Doctor check passes before driving anything: `packages/postman-test-utils/dist/cli.js` exists and `--help` exits `0`.
- Serve a loopback endpoint for a run. The helper starts its own on an ephemeral port; a hand-run `--emit` needs no server.
- Write proof under `artifacts/verify/<feature>/`. `artifacts/` is gitignored.
- Never point a collection at a real endpoint or a real secret.

## Driving conventions

- Prefer the built CLI at `packages/postman-test-utils/dist/cli.js` and the public API from `packages/*/dist/index.js` over `src` imports and internal test helpers.
- Run every mapped surface through `scripts/drive.mjs` from the repository root.
- Run the installed-layout check with `just smoke` or `npm run smoke`.
- Use a loopback URL (`http://127.0.0.1:<port>`) in every collection variable.
- Keep proof artifacts during cleanup. The helper removes only its scratch directory.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final line.
- A run proof includes the exit code and the newman summary line or the failure line.
- An emit proof includes the written file, the prelude line, and the absence of any secret value.
- A secret proof includes the `reveal`ed value and a run whose test asserts the in-memory environment value.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph of user-visible behavior, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with the node helper and the built CLI`, and `Gotchas`.

## Features

- [Run a collection offline](./run-collection.md) covers the CLI `run` command, the config file, and exit codes.
- [Emit a collection](./emit-collection.md) covers `--emit` and the baked-in validation prelude.
- [Engine library API](./engine-library.md) covers `runCollection`, `prepareRunRequest`, `withHelpers`, and the boundary errors.
- [Secrets](./secrets.md) covers `@simpsonm09/postman-secrets`, the providers, and the branded value.
- [Request validation](./validation.md) covers `@simpsonm09/postman-request-validation` and the injected prelude.
- [Installed-layout smoke](./smoke-install.md) covers `just smoke`.
