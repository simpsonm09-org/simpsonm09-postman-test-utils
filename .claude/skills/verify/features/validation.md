# Request validation

The `@simpsonm09/postman-request-validation` package ships one declarative validation suite with two loaders: `pm.require` inside Postman and the injected prelude offline in newman. A script calls `execute({ SCENARIO })` to assert status, body values, schema, arrays, regexes, SSE events, variable saves, and polling.

## Sub-features

- `validation-prelude` runs offline through `pm.testUtils.requestValidation.execute`, injected by `validation: { suite: "request-validation" }`.
- `validation-require` loads the same suite inside Postman through `pm.require("@simpsonm09/postman-request-validation")`.
- `validation-status` asserts `SCENARIO.status`, for example `{ oneOf: [200] }`.
- `validation-json` asserts `SCENARIO.response` for `kind: "json"` with `values`, `notValues`, `regex`, `arrays`, and `schema`.
- `validation-sse` asserts `kind: "sse"` events by name and data.
- `validation-variables` saves and clears variables, with an event source for SSE.
- `validation-polling` retries with `RETRY_ON_WITH_POLLING` until a condition holds.

## How to get to it (user POV)

- Offline, pass `validation: { suite: "request-validation" }` to the engine and call `pm.testUtils.requestValidation.execute({ SCENARIO })` in a collection script.
- In Postman, `const validation = pm.require("@simpsonm09/postman-request-validation"); validation.execute({ SCENARIO });`.
- Support both with the runtime check `typeof pm.require === "function"`.
- The built entry is `packages/postman-request-validation/dist/index.js`.

## Driving it with the node helper and the built CLI

Preconditions:

- The Doctor check passes and the built `dist` is current.
- The helper starts a loopback `/health` server that returns `{ "ok": true }`.

- **Prelude run.** The helper builds a config with `validation: { suite: "request-validation" }` and a collection whose test calls `pm.testUtils.requestValidation.execute({ SCENARIO: { status: { oneOf: [200] }, response: { kind: "json", expect: { values: { ok: true } } } } })`. `evidence.json` key `validation_run.exitCode` is `0` and `validation_run.assertions` is at least `2`.
- **Baked copy.** The emit drive writes the same suite into a collection file, so the emitted collection can run under plain `newman run` with no engine.
- **Proof.** Keep `artifacts/verify/validation/evidence.json` and `transcript.txt`. The transcript records the run and the assertion count.

## Gotchas

- `pm.require` is plan-gated in Postman, so the Postman-side loader cannot be verified here. The newman prelude path has no gate.
- The suite has no runtime dependencies and imports no Node builtins; the prelude is the factory serialized with `Function.prototype.toString`. Adding a module-scope reference breaks the sandbox.
- A `204 No Content` response skips the body checks, so a passing run on a 204 proves less than it looks.
- Without `SCENARIO.response`, only the status check and the variable actions run.
- Drive the suite through a real collection run. Importing the factory in Node needs a `pm` global and does not prove the prelude path.
