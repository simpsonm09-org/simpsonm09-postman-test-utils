# postman-test-utils working agreements

A TypeScript monorepo that runs Postman collections offline and validates responses.

## Ground rules

- The three packages stay in lockstep. A contract change updates the others and the workspace tests in the same change.
- Secrets are resolved in memory only. Never write a secret to disk or a log.
- Keep `newman` an optional peer dependency.
- No secret, credential, or machine path is committed.

## Commands

- `just install`, `just typecheck`, `just build`, `just test`, `just verify`, `just smoke`.

## Repo facts

- Language and toolchain: TypeScript, npm workspaces, Vitest, Node.
- Packages: `postman-test-utils`, `@simpsonm09/postman-secrets`, and `@simpsonm09/postman-request-validation`.
- The engine runs collection v2.1 JSON through newman. Newman cannot read the v3 YAML layout, so v2.1 is required for offline runs.
- Publishing goes to npm from `dist/` and to JSR from source, in dependency order. See `docs/publishing.md`.
- Docs: `docs/usage.md`, `docs/design.md`, `docs/publishing.md`.

## Skills

No repo-local skills. General best practices and integration come from the plugins.
