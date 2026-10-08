# Secrets

The `@simpsonm09/postman-secrets` package resolves Postman test secrets from the environment, HashiCorp Vault, or Infisical. A resolved value is a branded `SecretValue` that only `reveal` unwraps, and the engine merges it into the run environment in memory. A user binds a collection variable to a secret reference and never writes the value to disk.

## Sub-features

- `secrets-env` reads a value already present in the process environment, with no provider configuration.
- `secrets-vault` reads `vault kv get -format=json <path>` and handles KV v1 and KV v2.
- `secrets-infisical` reads `infisical secrets get <key> --plain --silent`.
- `secrets-brand` returns a branded `SecretValue`; `reveal` is the only unwrap.
- `secrets-merge` merges a resolved binding into the run environment or globals through `runCollection({ secrets })`.
- `secrets-command` accepts a custom `command` runner to stub a provider in a test.

## How to get to it (user POV)

- From Node, `import { resolveSecrets, reveal } from "@simpsonm09/postman-secrets";`.
- Bind with `{ variable, secret: { provider: "env", name } }`, plus `scope: "globals"` for globals.
- Or declare the same bindings under `secrets` in the engine config and let `runCollection` resolve them.
- The built entry is `packages/postman-secrets/dist/index.js`.

## Driving it with the node helper and the built CLI

Preconditions:

- The Doctor check passes and the built `dist` is current.
- Only the `env` provider is driven offline; Vault and Infisical need their CLIs installed.

- **Resolve and reveal.** The helper imports `packages/postman-secrets/dist/index.js`, sets a fixture environment variable, calls `resolveSecrets([{ variable: "token", secret: { provider: "env", name: "PTU_VERIFY_SECRET" } }])`, and unwraps with `reveal`. `evidence.json` key `library_secrets` has `matches` `true`, `isString` `true`, and `bindingScope` `environment`.
- **Merge into a run.** The helper runs a collection whose test asserts `pm.environment.get("token")` equals the fixture value, with the same binding. `evidence.json` key `library_secret_run` has `success` `true` and `failedAssertions` `0`.
- **Never write it.** The emit drive reads the emitted collection and confirms the fixture value is absent (`emit_secret.secretAbsent`).
- **Proof.** Keep `artifacts/verify/secrets/evidence.json` and `transcript.txt`. The transcript records the resolve and the run result.

## Gotchas

- Drive the `env` provider offline. `vault` and `infisical` shell out to CLIs that must be installed and authenticated; a machine without them cannot verify those providers.
- The Vault token stays in the environment and is never passed as a command argument. Do not add one to a fixture.
- A resolved value is branded. Assigning it to a plain `string` field is a type error until `reveal` is called at the consuming boundary.
- An unset environment variable throws `SecretResolutionError`. A resolution failure is not an assertion failure.
- Never print or write a real resolved value. Use a fixed fixture value and assert its presence in memory and its absence on disk.
