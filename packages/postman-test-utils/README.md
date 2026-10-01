# postman-test-utils

Run a Postman v2.1 collection offline through newman, resolve secrets in
memory, and inject the request-validation suite as a script prelude. The package
is the engine of the [postman-test-utils workspace](../../README.md).

## Install

```sh
npm install postman-test-utils newman
```

`newman` is an optional peer dependency. Install it to run collections.

## Run from Node

```ts
import { runCollection } from "postman-test-utils";

const result = await runCollection({
  collection: "./collections/checkout.postman_collection.json",
  environment: "./environments/local.postman_environment.json",
});

if (!result.success) {
  for (const failure of result.failures) {
    console.error(`${failure.item}: ${failure.message}`);
  }
  process.exitCode = 1;
}
```

The collection and environment can be a file path or an inline object. Passing
objects is useful when a caller builds the collection in memory.

```ts
const result = await runCollection({
  collection: { info: { name: "health" }, item: [/* ... */] },
  environment: {
    name: "local",
    values: [{ key: "baseUrl", value: "http://127.0.0.1:4010", enabled: true }],
  },
});
```

### Request shape

```ts
interface RunRequest {
  collection: string | PostmanCollection;
  environment?: string | PostmanVariables;
  globals?: string | PostmanVariables;
  iterationData?: string;
  folder?: string | string[];
  reporters?: string[];
  timeoutRequestMs?: number;
  bail?: boolean;
  secrets?: SecretBinding[];
  validation?: { suite?: "request-validation"; listeners?: ("prerequest" | "test")[] };
}
```

### Result shape

```ts
interface RunResult {
  runner: "newman";
  success: boolean;
  stats: {
    iterations: number;
    requests: number;
    assertions: number;
    failedAssertions: number;
    durationMs: number;
  };
  failures: Array<{
    item: string;
    message: string;
    test: string | null;
    at: string | null;
  }>;
}
```

`success` is false when the run collected any failure. Assertion failures do not
throw. A run that cannot start throws `RunnerExecutionError`. A malformed request
throws `InvalidRunRequestError` before anything runs.

## Secrets

Bind collection variables to secret references. Values are resolved in memory
and merged into the environment or globals. Nothing is written to disk.

```ts
const result = await runCollection({
  collection: "./collections/checkout.json",
  environment: "./environments/local.json",
  secrets: [
    { variable: "baseUrl", secret: { provider: "vault", path: "secret/data/ci", field: "base_url" } },
    { variable: "token", scope: "globals", secret: { provider: "env", name: "API_TOKEN" } },
  ],
});
```

Providers come from [`@simpsonm09/postman-secrets`](../postman-secrets/README.md).

## Validation

`validation: { suite: "request-validation" }` prepends the suite from
[`@simpsonm09/postman-request-validation`](../postman-request-validation/README.md)
to every `prerequest` and `test` script. A script then calls
`pm.testUtils.requestValidation.execute({ SCENARIO })`. When the collection is a
file path, the engine reads it so the prelude can be injected.

## CLI

```sh
postman-test-utils run --config ./postman-test-utils.config.json
```

The config file is a `RunRequest` in JSON. Command line flags override it.

| Flag | Meaning |
| --- | --- |
| `--config <path>` | Config file. Defaults to `postman-test-utils.config.json`. |
| `--collection <path>` | Collection file. Overrides the config. |
| `--environment, -e <path>` | Environment file. Overrides the config. |
| `--globals, -g <path>` | Globals file. Overrides the config. |
| `--folder, -f <name>` | Run one folder. Repeat for several. |
| `--reporter, -r <name>` | Load a reporter. Repeat for several. |
| `--bail` | Stop the run on the first failure. |
| `--emit <path>` | Write the collection with the validation prelude baked in, then exit. Use it to run plain `newman run` or to import into Postman without `pm.require`. |
| `--help, -h` | Show help. |

The process exits `0` on success and `1` on failure.

## Script helpers

`withHelpers` returns a copy of the collection with a prelude prepended to
every `prerequest` and `test` script, so collection scripts can call shared
functions through `pm.testUtils`:

```ts
import { withHelpers } from "postman-test-utils/scripting";

const augmented = withHelpers(collection, [
  { name: "sign", body: "function (payload) { return payload; }" },
]);
```

Inside a script in the collection:

```js
const signed = pm.testUtils.sign(pm.request.body.raw);
pm.expect(signed).to.be.a("string");
```

`body` is a JavaScript expression, usually a function. `name` must be a valid
JavaScript identifier. `withHelpers` does not mutate its input and visits nested
folder items.
