# postman-test-utils

Run Postman collections offline through newman, resolve secrets from a secret manager, and validate responses with one shared suite. The same suite also loads inside Postman through `pm.require`.

The original lives in `simpsonm09-org/simpsonm09-postman-test-utils`; work happens on the personal fork. See [`repo-standard`](https://github.com/simpsonm09-org/simpsonm09-repo-standard).

## What it does

The workspace ships three packages.

| Package | npm | JSR | What it does |
| --- | --- | --- | --- |
| `postman-test-utils` | yes | yes | Runs a v2.1 collection through newman, resolves secrets, injects the validation prelude, and provides a CLI. |
| `@simpsonm09/postman-secrets` | yes | yes | Reads secrets from the environment, HashiCorp Vault, or Infisical. Never writes them to disk. |
| `@simpsonm09/postman-request-validation` | yes | yes | Declarative response validation for collection scripts. Loads via `pm.require` or the newman prelude. |

The engine runs collection v2.1 JSON through newman. That covers Postman 11 and Postman 12 collections exported to v2.1. Newman cannot read the v3 YAML folder layout that Postman 12 uses for Native Git, so export v2.1 for offline runs. The run needs no Postman account and no network beyond your own API.

## Quick start

```bash
just install
just verify
```

To run a collection, see [`docs/usage.md`](docs/usage.md).

## Commands

| Command | Does |
| --- | --- |
| `just install` | Installs the workspace dependencies. |
| `just typecheck` | Typechecks every package. |
| `just build` | Builds every package into `dist/`. |
| `just test` | Runs the test suite. |
| `just verify` | Typechecks, builds, and tests. |
| `just smoke` | Runs the installed-layout smoke test. |
| `just run <config>` | Runs a collection through the built CLI. |
| `just emit <config> <out>` | Writes a collection with the validation prelude baked in. |

## Documentation

Read [`docs/README.md`](docs/README.md) for usage, the design, and publishing.

## License

MIT. See [`LICENSE`](LICENSE).

## Related repositories

- [`repo-standard`](https://github.com/simpsonm09-org/simpsonm09-repo-standard) owns the shared CI, linting, security, and governance.
