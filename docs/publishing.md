# Publishing and first test

This covers how to get the packages in front of Postman Desktop and plain
newman, and what to check before the first publish.

## Before the first publish

Own the namespaces:

- The npm scope `@simpsonm09` for the two scoped packages.
- The `@simpsonm09` scope on [jsr.io](https://jsr.io) for JSR.

Confirm Postman can load an external package at all. Open a request in Postman
Desktop, add a public package from npm in the Packages dropdown, and run it. The
Postman Package Library needs a paid tier. Public packages from npm and JSR are
a newer feature and the plan requirement is not clearly documented. Settle it
here before publishing effort. If the plan blocks `pm.require`, the suite still
runs in Postman through the embedded prelude (see below).

## Local proof without a registry

```sh
npm run verify
npm run smoke
```

`npm run smoke` builds, then assembles the installed layout by hand the way npm
would after publish, and runs the CLI against a local server. It proves the
package graph, the exports map, the bin, and the prelude work outside the
workspace.

## Publish

Dry run first:

```sh
npm run publish:dry-run
```

Then publish, in dependency order:

```sh
npm run publish:packages
```

That runs `npm publish --workspace <name>` for secrets, then validation, then
the engine, so the engine's dependencies exist when it goes up. Use `--tag next`
for a pre-release: `node scripts/publish.mjs --publish --tag next`. Note that the
engine depends on the others at `^0.2.0`, so a `0.2.0-rc.0` pre-release does not
satisfy that range. For a first publish, publish `0.2.0` directly.

JSR, from each package directory or with `--config`:

```sh
npx jsr publish --config packages/postman-secrets/jsr.json
npx jsr publish --config packages/postman-request-validation/jsr.json
npx jsr publish --config packages/postman-test-utils/jsr.json
```

## Test in Postman Desktop

Publish the validation package, then in a request:

1. Open Scripts, then the Packages dropdown, and add
   `npm:@simpsonm09/postman-request-validation@0.2.0`, or the `jsr:` specifier.
2. Call the suite:

```js
const validation = pm.require("@simpsonm09/postman-request-validation");
validation.execute({
  SCENARIO: {
    status: { oneOf: [200] },
    response: { kind: "json", expect: { values: { ok: true } } }
  }
});
```

If the plan blocks `pm.require`, embed the prelude instead. Add
`"validation": { "suite": "request-validation" }` to
`postman-test-utils.config.json`, then emit a collection with the suite baked in
and import it:

```sh
npx postman-test-utils run --emit ./collection.with-validation.json --config ./postman-test-utils.config.json
```

`--emit` writes the collection with `pm.testUtils.requestValidation` available
in every script and exits without running. It never writes secret values. In a
script, call `pm.testUtils.requestValidation.execute({ SCENARIO })`. This path
works in Postman Desktop and in plain newman.

## Test with plain newman

`newman run` cannot `pm.require`. Bake the suite in first, then run the file
directly. With the same config that sets `validation`:

```sh
npx postman-test-utils run --emit ./collection.with-validation.json --config ./postman-test-utils.config.json
newman run ./collection.with-validation.json -e ./environment.json
```

## Test the GitHub Action

The action references `simpsonm09/simpsonm09-postman-test-utils@v1` and runs
`npx postman-test-utils@latest`, so it needs the engine on npm and a `v1` tag on
the repository. See `docs/examples/`.
