/** The result of running the suite against the current response. */
export interface ValidationResult {
  response: any;
  isNoContent: boolean;
}

/** The suite handle returned by `createRequestValidationSuite`. */
export interface RequestValidationSuite {
  execute(config?: unknown): ValidationResult;
}

/** A named body assigned to `pm.testUtils` by `withHelpers`. */
export interface ValidationHelper {
  name: string;
  body: string;
}
