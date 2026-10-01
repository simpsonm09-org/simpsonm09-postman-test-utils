export class InvalidRunRequestError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Invalid run request at "${field}": ${message}`);
    this.name = "InvalidRunRequestError";
    this.field = field;
  }
}

export class RunnerExecutionError extends Error {
  readonly runner: "newman";

  constructor(runner: "newman", cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Runner "${runner}" failed to execute: ${detail}`);
    this.name = "RunnerExecutionError";
    this.runner = runner;
  }
}
