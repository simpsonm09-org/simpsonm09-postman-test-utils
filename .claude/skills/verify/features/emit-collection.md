# Emit a collection

The `--emit` flag writes a copy of the collection with the request-validation prelude baked into every `prerequest` and `test` script, then exits without running newman. A user emits once to run plain `newman run <file>` or to import the collection into Postman without `pm.require`.

## Sub-features

- `emit-prelude` prepends the serialized validation factory to each script that already exists.
- `emit-listener` writes only to the listeners named in `validation.listeners`, both by default.
- `emit-nosecret` never writes a resolved secret value, even when the config declares `secrets`.
- `emit-plain` writes the collection unchanged when the config has no `validation`.
- `emit-exit` prints `wrote <path>` and exits `0`.

## How to get to it (user POV)

- From the repository root, run `node packages/postman-test-utils/dist/cli.js run --emit <out> --config <file>`.
- Or through the task runner, `just emit <config> <out>`, which builds first.
- Or from Node, `emitCollection({ collection, validation }, path)`.
- Then run the emitted file with `npx newman run <out>` with no engine.

## Driving it with the node helper and the built CLI

Preconditions:

- The Doctor check passes.
- The config file names a collection; `--emit` needs no server.

- **Bake the prelude.** Run `node .claude/skills/verify/scripts/drive.mjs --out artifacts/verify/emit-collection`. `evidence.json` key `emit.exitCode` is `0`, `emit.preludePresent` is `true`, and `emit.execLines` is at least `2` (prelude then the original script).
- **Never write a secret.** The helper emits from a config that declares a `secrets` binding for `PTU_VERIFY_SECRET`. `evidence.json` key `emit_secret.secretAbsent` is `true`, and `artifacts/verify/emit-collection/emitted-secret-free.postman_collection.json` does not contain the fixture value.
- **Hand-run.** Run `node packages/postman-test-utils/dist/cli.js run --emit artifacts/verify/emit-collection/emitted.json --config .claude/skills/verify/scripts/example/postman-test-utils.config.json`. It prints `wrote artifacts/verify/emit-collection/emitted.json`.
- **Proof.** Keep `emitted.postman_collection.json` and `emitted-secret-free.postman_collection.json` alongside `evidence.json`. Open the emitted file and confirm `item[0].event[0].script.exec[0]` contains `requestValidation`.

## Gotchas

- `--emit` exits before any request runs. It does not prove the run works; pair it with a `run`.
- A resolved secret reaches newman only as an in-memory environment object, so `--emit` must not write it. Assert the absence, not the exit code alone.
- The prelude is prepended only to scripts that already exist on an item or folder. An item with no `test` event gains nothing.
- `validation.listeners` narrows the injection; with `["prerequest"]` an existing `test` script is left alone.
- Keep the emitted files; cleanup removes only the helper's scratch directory.
