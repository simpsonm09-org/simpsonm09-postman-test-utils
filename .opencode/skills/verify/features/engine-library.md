# Engine library API

The `postman-test-utils` package exports the engine a Node caller uses directly: `runCollection` runs a collection, `prepareRunRequest` resolves secrets and injects validation, `withHelpers` prepends helpers, and the boundary errors carry the offending field. A user imports the package and awaits a typed `RunResult`.

## Sub-features

- `lib-runCollection` runs a collection given a file path or an inline object and returns a `RunResult`.
- `lib-prepareRunRequest` resolves secrets, merges them into the environment or globals, and applies the validation prelude.
- `lib-withHelpers` returns a copy of a collection with a helper prelude prepended, without mutating the input.
- `lib-normalize` throws `InvalidRunRequestError` at the boundary for a malformed request.
- `lib-runner-error` throws `RunnerExecutionError` when newman cannot start.

## How to get to it (user POV)

- From Node, `import { runCollection, prepareRunRequest, withHelpers } from "postman-test-utils";`.
- Pass `collection` as a file path or an inline object; pass `environment` as a file path or an inline `{ values }` object.
- Read `result.success`, `result.stats`, and `result.failures`.
- The built entry is `packages/postman-test-utils/dist/index.js`; the `./scripting` subpath also exports `withHelpers`.

## Driving it with the node helper and the built CLI

Preconditions:

- The Doctor check passes and the built `dist` is current.
- The helper starts a loopback server for the run.

- **Run.** The helper imports `packages/postman-test-utils/dist/index.js` and awaits `runCollection({ collection, environment })`. `evidence.json` key `library_run` has `runner` `newman`, `success` `true`, `requests` `1`, and `failedAssertions` `0`.
- **Helpers.** The helper calls `withHelpers(collection, [{ name: "sign", body: "function (payload) { return payload; }" }])`. `evidence.json` key `library_withHelpers` has `mutated` `false` and `preludeFirst` `true`.
- **Boundary error.** The helper calls `runCollection({ collection: "" })`. `evidence.json` key `library_invalid` has `name` `InvalidRunRequestError` and `field` `collection`.
- **Proof.** Keep `artifacts/verify/engine-library/evidence.json` and `transcript.txt`. The transcript records each call and its real result.

## Gotchas

- A file path and an inline object are both accepted, but a string must be a path to a collection file. An inline object must carry an `item` array.
- An assertion failure resolves with `success: false` and never throws; only a start failure throws `RunnerExecutionError`.
- `newman` is an optional peer dependency and is imported lazily. A run with the module absent throws `RunnerExecutionError`, not a missing-import error at module load.
- `withHelpers` uses `structuredClone`, so the input is never mutated and the return value is safe to pass on.
- Import the built `dist`, not `src`, so the run proves the published artifact.
