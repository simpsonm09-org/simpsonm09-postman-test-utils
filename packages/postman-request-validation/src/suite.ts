/**
 * The suite factory. `validationHelpers` serializes this function with
 * `Function.prototype.toString` and prepends the source of every module in
 * `prelude.ts`, so the emitted prelude is self-contained. That is why every
 * name this function calls is exported from a helper module: the serializer
 * ships the definition alongside the call.
 */
import { compileScenarioConfig } from "./compile.js";
import { executeScenarioValidations } from "./execute.js";
import { normalizeObject } from "./internal.js";
import {
  clearRetryAttempt,
  executeWithPolling,
  normalizeRetryOnWithPolling,
} from "./retry.js";
import type { RequestValidationSuite, ValidationResult } from "./types.js";

export function createRequestValidationSuite(): RequestValidationSuite {
  /**
   * Executes all configured response validations.
   *
   * @param rawConfig.SCENARIO Declarative status and optional response validation.
   * @param rawConfig.SCENARIO.status Status expectations, for example `{ oneOf: [200] }`.
   * @param rawConfig.SCENARIO.response Response expectations for `json` or `sse`.
   * @param rawConfig.SCENARIO.variables Variable save and clear actions.
   * @param rawConfig.RETRY_ON_WITH_POLLING Polling retry configuration.
   */
  function execute(rawConfig: any = {}): ValidationResult {
    let compiled: any;

    try {
      compiled = compileScenarioConfig(rawConfig);
    } catch (error) {
      pm.test("SCENARIO configuration is valid", () => {
        throw error;
      });

      return {
        response: null,
        isNoContent: pm.response.code === 204,
      };
    }

    const retryConfig = normalizeRetryOnWithPolling(
      normalizeObject(rawConfig.RETRY_ON_WITH_POLLING),
    );

    if (!retryConfig || !retryConfig.valid) {
      if (retryConfig?.stateVariable) {
        clearRetryAttempt(retryConfig.stateVariable);
      }

      return executeScenarioValidations(compiled);
    }

    return executeWithPolling(
      compiled,
      retryConfig,
      executeScenarioValidations,
    );
  }

  return { execute };
}
