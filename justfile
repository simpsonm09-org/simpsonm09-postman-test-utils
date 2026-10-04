# Cross-platform task runner for humans and agents. `just --list` shows every
# recipe. Each recipe delegates to an npm script or a Node script, so the logic
# lives in one place and works on Windows, macOS, and Linux.
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# List the recipes.
default:
    @just --list

# Install workspace dependencies.
install:
    npm install

# Run every linter over the tracked files.
lint:
    mise exec -- flint run --full

# Typecheck every package.
typecheck:
    npm run typecheck

# Build every package into dist/.
build:
    npm run build

# Run the test suite.
test:
    npm test

# Run the tests and write an lcov report to coverage/lcov.info.
coverage:
    npm run coverage

# Typecheck, build, and test.
verify:
    npm run verify

# Build, then run the installed-layout smoke test.
smoke:
    npm run smoke

# Preview a publish for all three packages.
publish-dry:
    npm run publish:dry-run

# Publish all three packages in dependency order.
publish:
    npm run publish:packages

# Run a collection through the built CLI. Example: just run postman-test-utils.config.json
run config: build
    node packages/postman-test-utils/dist/cli.js run --config '{{config}}'

# Write a collection with the validation prelude baked in.
# Example: just emit postman-test-utils.config.json collection.with-validation.json
emit config out: build
    node packages/postman-test-utils/dist/cli.js run --emit '{{out}}' --config '{{config}}'


# Prune remote-tracking refs and delete local branches merged into main.
prune:
    node scripts/prune.mjs