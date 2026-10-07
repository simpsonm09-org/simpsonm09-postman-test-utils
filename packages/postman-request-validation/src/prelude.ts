/**
 * Builds the script prelude newman evaluates offline.
 *
 * `withHelpers` assigns this body to `pm.testUtils[name]`, so the body must be
 * a self-contained expression: it cannot rely on imports. It concatenates the
 * source of every helper module with `Function.prototype.toString`, then the
 * factory source, and calls the factory inside that scope. The result is the
 * same suite the package exports, with no module-scope reference left dangling.
 *
 * Every helper function is exported from its module, so reflecting the module
 * exports (`Object.values`) collects the whole set. A new helper joins the
 * prelude by being exported; a Node-only helper must not live in these modules.
 */
import * as assertions from "./assertions.js";
import * as compile from "./compile.js";
import * as execution from "./execute.js";
import * as internal from "./internal.js";
import * as retry from "./retry.js";
import * as sse from "./sse.js";
import { createRequestValidationSuite } from "./suite.js";
import type { ValidationHelper } from "./types.js";
import * as variables from "./variables.js";
import * as variablesCompile from "./variables-compile.js";

const HELPER_MODULES: ReadonlyArray<object> = [
  internal,
  compile,
  variablesCompile,
  execution,
  sse,
  assertions,
  variables,
  retry,
];

type HelperFunction = (...args: never[]) => unknown;

/**
 * Vitest loads this package through vite-node's SSR transform, which rewrites
 * an imported identifier `isObject` to `__vite_ssr_import_0__.isObject` in the
 * function source. The prelude defines every helper at the top of its own
 * scope, so the indirection is stripped to recover the bare name. Under tsc
 * (the published build) the imports are already bare and this is a no-op.
 */
const SSR_IMPORT_REFERENCE = /__vite_ssr_import_\d+__\./g;

function toStandaloneSource(target: HelperFunction): string {
  return target.toString().replace(SSR_IMPORT_REFERENCE, "");
}

function collectHelperSource(): string {
  const sources: string[] = [];

  for (const helperModule of HELPER_MODULES) {
    for (const value of Object.values(helperModule)) {
      if (typeof value === "function") {
        sources.push(toStandaloneSource(value));
      }
    }
  }

  return sources.join("\n");
}

export function validationHelpers(): readonly ValidationHelper[] {
  return [
    {
      name: "requestValidation",
      body: `(function () {\n${collectHelperSource()}\nreturn (${toStandaloneSource(createRequestValidationSuite)})();\n})()`,
    },
  ];
}
