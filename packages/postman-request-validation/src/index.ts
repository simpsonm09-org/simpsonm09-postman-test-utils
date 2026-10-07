/**
 * request-validation
 *
 * Response validation for Postman collections. The suite loads two ways:
 *
 * 1. In Postman, through `pm.require("@simpsonm09/postman-request-validation")`,
 *    then `validation.execute({ SCENARIO })`.
 * 2. Offline in newman, through the injected prelude, then
 *    `pm.testUtils.requestValidation.execute({ SCENARIO })`.
 *
 * The public API is unchanged from the single-file form. The implementation is
 * split into cohesive modules; `prelude.ts` reassembles the factory and its
 * helpers into one self-contained prelude, so both loaders share one source.
 */
import { validationHelpers } from "./prelude.js";
import { createRequestValidationSuite } from "./suite.js";
import type { ValidationResult } from "./types.js";

export { validationHelpers } from "./prelude.js";
export { createRequestValidationSuite } from "./suite.js";
export type {
  RequestValidationSuite,
  ValidationHelper,
  ValidationResult,
} from "./types.js";

/** Runs the suite against the current Postman response. */
export function execute(config?: unknown): ValidationResult {
  return createRequestValidationSuite().execute(config);
}

export default { execute, createRequestValidationSuite, validationHelpers };
