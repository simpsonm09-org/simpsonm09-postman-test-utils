# @simpsonm09/postman-request-validation

Declarative response validation for Postman collection scripts. One suite, two
loaders: `pm.require` inside Postman and the newman prelude offline.

## Load the suite

In Postman, and in any run that supports packages:

```js
const validation = pm.require("@simpsonm09/postman-request-validation");
validation.execute({ SCENARIO });
```

Offline in newman, inject the prelude through the engine:

```ts
await runCollection({
  collection: "./collections/checkout.json",
  validation: { suite: "request-validation" },
});
```

Then call `pm.testUtils.requestValidation.execute({ SCENARIO })`.

A script can support both:

```js
const validation = typeof pm.require === "function"
  ? pm.require("@simpsonm09/postman-request-validation")
  : pm.testUtils.requestValidation;
validation.execute({ SCENARIO });
```

## SCENARIO

```js
const SCENARIO = {
  status: { oneOf: [200] },
  response: {
    kind: "json",
    expect: {
      schema: { type: "object", required: ["linkRoot"] },
      values: { "linkRoot.currency": "USD" },
      notValues: { "linkRoot.status": "CANCELLED" },
      regex: { "linkRoot.linkId": /^[0-9a-f-]{36}$/i },
      arrays: {
        statuses: [
          { status: "CREATED", source: "API_CONSUMER" },
          { status: "AWAITING_AUTHORIZATION", providerId: /^PL/ }
        ]
      }
    }
  },
  variables: {
    save: [
      { scope: "environment", variable: "linkId", source: "linkRoot.linkId" }
    ],
    clear: [{ scope: "collection", variable: "providerId" }]
  }
};

validation.execute({ SCENARIO });
```

`status` and `response` are optional. Without `response`, only the status check
and the variable actions run. `response.kind` is `"json"` or `"sse"`.

Expectation keys:

- `schema` runs `pm.response.to.have.jsonSchema`.
- `values` asserts an exact value at a path.
- `notValues` asserts a value differs.
- `regex` asserts a string matches a regular expression.
- `arrays` asserts the array contains an object matching each listed object.
  `arrayContains` is an accepted alias.
- A value of `{ variable: "name" }` resolves from the current Postman variables.

A `204 No Content` response skips the body checks.

## SSE

```js
const SCENARIO = {
  status: { oneOf: [200] },
  response: {
    kind: "sse",
    expect: {
      events: [
        {
          name: "link-status",
          data: { values: { linkId: { variable: "linkId" }, status: "AUTHORIZED" } }
        }
      ]
    }
  }
};
```

For SSE, variable saves use an event source:

```js
{ scope: "environment", variable: "authorizationId", source: { event: 0, data: "authorizationId" } }
```

## Polling

```js
const RETRY_ON_WITH_POLLING = {
  statuses: [200],
  attempts: 60,
  delayMs: 1000,
  backoff: { multiplier: 2, maxDelayMs: 5000 },
  shouldRetry: response => response.linkRoot.status !== "AUTHORIZED"
};

validation.execute({ SCENARIO, RETRY_ON_WITH_POLLING });
```

Each attempt runs as a dry run so variables are not saved until the final
attempt. Retry state lives in a collection variable keyed by the request.

## Sandbox safety

The package has no runtime dependencies and imports no Node builtins. The
factory is serialized with `Function.prototype.toString` to build the newman
prelude, so one source serves both loaders and the two cannot drift. A workspace
test guards the no-`node:` invariant.
