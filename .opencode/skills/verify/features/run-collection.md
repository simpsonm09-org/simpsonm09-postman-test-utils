# Run a collection offline

The CLI runs a Postman v2.1 collection through newman with no Postman account and no network beyond the API under test. A user points it at a config file, sees a one-line summary plus one line per failure, and gets exit `0` on success or `1` on any failure.

## Sub-features

- `run-config` runs the collection named in a config file, `postman-test-utils.config.json` by default.
- `run-overrides` overrides the config with `--collection`, `--environment`, `--globals`, `--folder`, `--reporter`, and `--bail`.
- `run-environment` merges an environment file into `{{baseUrl}}` and other variables.
- `run-success` exits `0` and prints `newman: <n> iteration(s), <n> request(s), <n> assertion(s), 0 failed, <ms>ms`.
- `run-failure` reports each failed assertion and exits `1` without throwing.
- `run-help` prints the usage block and exits `0`.

## How to get to it (user POV)

- From the repository root, run `node packages/postman-test-utils/dist/cli.js run --config <file>`.
- Or through the task runner, `just run <config>`, which builds first.
- Or from Node, `runCollection({ collection, environment })` from the engine library.
- The config is a `RunRequest` in JSON: `collection`, `environment`, `validation`, `secrets`, and the run options.

## Driving it with the node helper and the built CLI

Preconditions:

- The Doctor check passes and the loopback server the helper starts is up.
- `newman` is installed (it is a dev dependency here).

- **Help.** Run `node packages/postman-test-utils/dist/cli.js --help`. Exit `0` and the output contains `Usage: postman-test-utils run`.
- **Passing run.** Run `node .opencode/skills/verify/scripts/drive.mjs --out artifacts/verify/run-collection`. The helper copies the example collection and environment into scratch, starts a loopback server, and runs the CLI. `evidence.json` key `run_success.exitCode` is `0` and `run_success.stdout` matches `newman: 1 iteration(s), 1 request(s), 1 assertion(s), 0 failed`.
- **Failing run.** The helper also runs a collection whose test asserts `true === false`. `evidence.json` key `run_failure.exitCode` is `1` and `run_failure.stderr` contains `always fails`.
- **Proof.** Keep `artifacts/verify/run-collection/evidence.json` and `transcript.txt`. The transcript records each command and its real output.

## Gotchas

- Newman reads only collection v2.1 JSON. A Postman 12 v3 YAML export does not run offline; export v2.1.
- A failed assertion does not throw. The CLI returns exit `1` and prints the failures; check the exit code, not only the stdout.
- A run that cannot start throws `RunnerExecutionError`, and a malformed request throws `InvalidRunRequestError` before newman runs. These are different from an assertion failure.
- `--folder` and `--reporter` may repeat; `--config` is the default `postman-test-utils.config.json` when omitted.
- Keep the artifacts; cleanup stops the helper's server, not the proof.
