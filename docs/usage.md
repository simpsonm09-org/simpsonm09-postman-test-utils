# Usage

Run a collection offline, bind secrets, and validate responses.

## Install

```sh
npm install postman-test-utils newman
```

`newman` is an optional peer dependency. Install it to run collections.

## Run a collection

From a config file, with no code:

```sh
npx postman-test-utils run --config ./postman-test-utils.config.json
```

`postman-test-utils.config.json`:

```json
{
  "collection": "./collections/checkout.postman_collection.json",
  "environment": "./environments/local.postman_environment.json",
  "secrets": [
    { "variable": "token", "secret": { "provider": "env", "name": "API_TOKEN" } }
  ]
}
```

From Node:

```ts
import { runCollection } from "postman-test-utils";

const result = await runCollection({
  collection: "./collections/checkout.postman_collection.json",
  environment: "./environments/local.postman_environment.json",
  validation: { suite: "request-validation" },
});

if (!result.success) {
  for (const failure of result.failures) {
    console.error(`${failure.item}: ${failure.message}`);
  }
  process.exitCode = 1;
}
```

The CLI exits `0` on success and `1` on failure. See [`../packages/postman-test-utils/README.md`](../packages/postman-test-utils/README.md) for the full request and result shape.

## Secrets

Bind a collection variable to a secret reference. The value is resolved in memory and merged into the run environment.

```json
{
  "secrets": [
    { "variable": "baseUrl", "secret": { "provider": "vault", "path": "secret/data/ci", "field": "base_url" } },
    { "variable": "token", "scope": "globals", "secret": { "provider": "infisical", "key": "TOKEN", "environment": "dev" } }
  ]
}
```

When CI already injects the values, the `env` provider reads them with no provider configuration. See [`../packages/postman-secrets/README.md`](../packages/postman-secrets/README.md).

## Validation in Postman and offline

Inside a Postman collection script, load the suite with `pm.require`:

```js
const validation = pm.require("@simpsonm09/postman-request-validation");
validation.execute({
  SCENARIO: {
    status: { oneOf: [200] },
    response: { kind: "json", expect: { values: { ok: true } } }
  }
});
```

Offline, pass `validation: { suite: "request-validation" }` and the engine prepends the same suite to the collection scripts. A script can use both by resolving whichever is present:

```js
const validation = typeof pm.require === "function"
  ? pm.require("@simpsonm09/postman-request-validation")
  : pm.testUtils.requestValidation;
```

See [`../packages/postman-request-validation/README.md`](../packages/postman-request-validation/README.md) for `SCENARIO`, `RETRY_ON_WITH_POLLING`, SSE, and variable handling.

## GitHub Actions

The repository ships a composite action. It installs the package and runs the CLI.

```yaml
- uses: simpsonm09/simpsonm09-postman-test-utils@v1
  with:
    command: '--config ./postman-test-utils.config.json'
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
```

More examples live in [`examples/`](examples).
