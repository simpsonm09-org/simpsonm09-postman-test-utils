# @simpsonm09/postman-secrets

Resolve Postman test secrets from the environment, HashiCorp Vault, or
Infisical. Values are branded `SecretValue` and unwrapped with `reveal` at the
point of use, so a secret cannot flow into a file or log by accident.

## Install

```sh
npm install @simpsonm09/postman-secrets
```

## Bindings

A binding maps a collection variable to a secret reference.

```ts
import { resolveSecrets, reveal } from "@simpsonm09/postman-secrets";

const resolved = await resolveSecrets([
  { variable: "token", secret: { provider: "env", name: "API_TOKEN" } },
  { variable: "baseUrl", secret: { provider: "vault", path: "secret/data/ci", field: "base_url" } },
  { variable: "other", scope: "globals", secret: { provider: "infisical", key: "OTHER", environment: "dev" } },
]);

reveal(resolved.values.get("token")!);
```

The engine calls this for you through `runCollection({ secrets })`.

## Providers

| Provider | Reference | Command | Authentication |
| --- | --- | --- | --- |
| `env` | `{ provider: "env", name }` | none | Reads `process.env`. |
| `vault` | `{ provider: "vault", path, field }` | `vault kv get -format=json <path>` | `VAULT_TOKEN` and `VAULT_ADDR` in the environment. |
| `infisical` | `{ provider: "infisical", key, environment?, path?, projectId? }` | `infisical secrets get <key> --plain --silent` | `INFISICAL_TOKEN` in the environment. |

KV v2 and KV v1 responses are both handled. Use `env` when a CI action has
already injected the values.

Pass a custom `command` runner to test or stub a provider:

```ts
const provider = vaultProvider({
  command: async () => ({ stdout: '{"data":{"data":{"token":"abc"}}}', stderr: "" }),
});
```

## Security

No secret is written to disk. The Postman CLI temp-file path is gone, so a
resolved value only exists in memory and in the newman environment object. The
Vault token is never placed in a command argument. `reveal` is the only unwrap,
which gives a single audit point.
