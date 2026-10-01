# Design

## Scope

Run a Postman collection offline through newman, resolve secrets from a secret
manager, and validate responses with one shared suite that also loads inside
Postman.

"Postman 11 or 12" is a collection format difference, not a CLI version. Postman
11 uses collection v2.1 JSON. Postman 12 uses the v3 YAML folder layout for
Native Git. Newman reads only v2.1. The Postman CLI reads both but needs a
Postman account for the package library and the cloud. The workspace chooses
newman so a run needs no account and works offline. A v12 workspace exports v2.1
for offline runs.

## Module map

| Package | Module | Responsibility |
| --- | --- | --- |
| `postman-test-utils` | `src/types.ts` | Domain types for the run request, prepared request, and result. |
| | `src/normalize.ts` | The input boundary. `unknown` to `NormalizedRunRequest`, or `InvalidRunRequestError`. |
| | `src/run.ts` | `runCollection` and `prepareRunRequest`. Resolve secrets, merge them, inject validation. |
| | `src/runners/newman.ts` | The newman adapter plus the pure `normalizeRunSummary`. |
| | `src/scripting.ts` | `buildHelperPrelude` and `withHelpers`. |
| | `src/config.ts` | CLI argument parsing and config file loading. |
| | `src/cli.ts` | The `postman-test-utils` bin. |
| `postman-secrets` | `src/*.ts` | Env, Vault, and Infisical providers, the branded `SecretValue`, and `resolveSecrets`. |
| `postman-request-validation` | `src/index.ts` | The validation suite as one self-contained factory, plus the prelude loader. |

## Decisions

**newman is the only engine.** The user chose offline runs over the Postman
CLI. The CLI needs an account for the package library and the cloud, so the
Postman CLI adapter, the cloud target, the runner registry, and the availability
probe were deleted rather than kept as dead branches. This is
`principle-laziness-protocol`. The registry shape can return as a new module if a
second engine is ever needed.

**One package per real build constraint.** The engine is Node-only, the secrets
package is Node-only and security-sensitive, and the validation suite must stay
sandbox-safe and dependency-free so `pm.require` can load its root. Each split
follows a different constraint, not a flavor. Independent versioning is
deliberately deferred so the three packages release together from one pipeline.

**The validation suite is one factory, serialized for the prelude.** `pm.require`
loads the package root, and the newman sandbox needs the code as a script
prelude. `validationHelpers` calls `Function.prototype.toString` on the factory
to build the prelude, so both loaders share one source and cannot drift. Every
helper lives inside the factory for this reason. A workspace test asserts the
source and the built bundle contain no Node builtins. This is
`principle-model-the-domain` and `principle-type-system-discipline`.

**Secrets are branded and unwrapped once.** `SecretValue` cannot be assigned to a
plain `string` without `reveal`. That removes the temp-file write in the old
Postman CLI adapter, which would have put resolved values on disk. The Vault
token stays in the environment, never in an argument. This is
`principle-type-system-discipline` and `principle-boundary-discipline`.

**One boundary parser.** `normalizeRunRequest` owns every shape check for the
library and the CLI. The adapters and the suite trust typed input. The newman
summary stays inside the adapter. This is `principle-boundary-discipline`.

**Result adaptation is pure.** `normalizeRunSummary` takes a value and returns a
value, so the mapping is tested without spawning newman.

**Helpers inject as a prelude.** The Postman sandbox and the newman sandbox do
not load arbitrary local modules from a collection script. Prepending the
definitions to the existing `prerequest` and `test` events works for newman and
is accepted by the Postman sandbox. `withHelpers` returns a copy and never
mutates the caller's collection.

**Dual publish from one source.** TypeScript in `src/` compiles to `dist/` for
npm and publishes as-is to JSR. Versions live in each `package.json` and
`jsr.json`; a workspace test fails if they drift.

## Open questions

- `pm.require` is plan-gated in Postman. The Postman-side delivery needs one real
  run on a plan that allows packages to confirm it. The newman path has no gate.
- The Vault and Infisical providers shell out to CLIs that must be installed.
  They are documented prerequisites, not vendored.
- Secret values reach newman as an in-memory environment object, which is not a
  disk write. They would appear in a process argument only if a future engine
  passes them on a command line, which this engine does not do.
