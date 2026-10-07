/** RETRY_ON_WITH_POLLING normalization and the polling re-run loop. */

import type { ValidationResult } from "./types.js";

export function executeWithPolling(
  config: any,
  retryConfig: any,
  executeAttempt: (config: any, options?: any) => ValidationResult,
): ValidationResult {
  let hasFailure = false;

  const dryRunResult = executeAttempt(config, {
    reportTest: (name: string, callback: () => void) => {
      try {
        callback();
      } catch {
        hasFailure = true;
      }
    },
    reportSkippedTest: () => {},
    applyVariableChanges: false,
  });

  const currentAttempt = getRetryAttempt(retryConfig.stateVariable);
  const nextAttempt = currentAttempt + 1;

  const canRetry =
    retryConfig.statuses.includes(pm.response.code) &&
    nextAttempt < retryConfig.attempts;

  if (!canRetry) {
    clearRetryAttempt(retryConfig.stateVariable);
    return executeAttempt(config);
  }

  if (retryConfig.shouldRetry) {
    let shouldRetry: any;

    try {
      shouldRetry = retryConfig.shouldRetry(dryRunResult.response);
    } catch (error) {
      clearRetryAttempt(retryConfig.stateVariable);
      pm.test("RETRY_ON_WITH_POLLING.shouldRetry failed", () => {
        throw error;
      });
      return executeAttempt(config);
    }

    if (shouldRetry !== true) {
      clearRetryAttempt(retryConfig.stateVariable);
      return executeAttempt(config);
    }
  } else if (!hasFailure) {
    clearRetryAttempt(retryConfig.stateVariable);
    return executeAttempt(config);
  }

  setRetryAttempt(retryConfig.stateVariable, nextAttempt);

  setTimeout(
    () => {
      pm.execution.setNextRequest(pm.info.requestId || pm.info.requestName);
    },
    getPollingDelayMs(retryConfig, nextAttempt),
  );

  return dryRunResult;
}

export function normalizeRetryOnWithPolling(retryConfig: any): any {
  const stateVariable = getRetryStateVariable();

  const hasShouldRetry =
    retryConfig.shouldRetry !== undefined && retryConfig.shouldRetry !== null;

  const hasBackoff =
    retryConfig.backoff !== undefined && retryConfig.backoff !== null;

  const backoff = normalizeRetryBackoff(retryConfig, hasBackoff);

  if (!isValidRetryConfig(retryConfig, hasBackoff, hasShouldRetry, backoff)) {
    return Object.keys(retryConfig).length > 0
      ? { valid: false, stateVariable }
      : null;
  }

  return {
    valid: true,
    statuses: retryConfig.statuses,
    attempts: retryConfig.attempts,
    delayMs: retryConfig.delayMs,
    backoff,
    shouldRetry: hasShouldRetry ? retryConfig.shouldRetry : null,
    stateVariable,
  };
}

export function normalizeRetryBackoff(retryConfig: any, hasBackoff: boolean): any {
  if (!hasBackoff) {
    return null;
  }

  const backoff = retryConfig.backoff;

  if (
    backoff !== null &&
    typeof backoff === "object" &&
    !Array.isArray(backoff) &&
    Number.isFinite(backoff.multiplier) &&
    backoff.multiplier >= 1 &&
    Number.isFinite(backoff.maxDelayMs) &&
    backoff.maxDelayMs >= retryConfig.delayMs
  ) {
    return {
      multiplier: backoff.multiplier,
      maxDelayMs: backoff.maxDelayMs,
    };
  }

  return null;
}

export function isValidRetryConfig(
  retryConfig: any,
  hasBackoff: boolean,
  hasShouldRetry: boolean,
  backoff: any,
): boolean {
  if (!hasValidRetryStatuses(retryConfig.statuses)) {
    return false;
  }

  if (!isPositiveInteger(retryConfig.attempts)) {
    return false;
  }

  if (!isNonNegativeFinite(retryConfig.delayMs)) {
    return false;
  }

  if (hasBackoff && backoff === null) {
    return false;
  }

  if (hasShouldRetry && typeof retryConfig.shouldRetry !== "function") {
    return false;
  }

  return true;
}

export function isPositiveInteger(value: any): boolean {
  return Number.isInteger(value) && value >= 1;
}

export function isNonNegativeFinite(value: any): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function hasValidRetryStatuses(statuses: any): boolean {
  return (
    Array.isArray(statuses) &&
    statuses.length > 0 &&
    statuses.every(
      (status: any) =>
        Number.isInteger(status) && status >= 100 && status <= 599,
    )
  );
}

export function getPollingDelayMs(retryConfig: any, nextAttempt: number): number {
  if (
    retryConfig.backoff === null ||
    retryConfig.backoff === undefined ||
    retryConfig.delayMs === 0
  ) {
    return retryConfig.delayMs;
  }

  const delay =
    retryConfig.delayMs * retryConfig.backoff.multiplier ** (nextAttempt - 1);

  return Number.isFinite(delay)
    ? Math.min(retryConfig.backoff.maxDelayMs, delay)
    : retryConfig.backoff.maxDelayMs;
}

export function getRetryStateVariable(): string {
  const requestIdentity =
    pm.info?.requestId || pm.info?.requestName || "current";

  const safeRequestIdentity = String(requestIdentity).replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );

  return `__request_validation_attempt_${safeRequestIdentity}`;
}

export function getRetryAttempt(stateVariable: string): number {
  const value = pm.collectionVariables.get(stateVariable);
  return Number.isInteger(Number(value)) ? Number(value) : 0;
}

export function setRetryAttempt(stateVariable: string, attempt: number): void {
  pm.collectionVariables.set(stateVariable, attempt);
}

export function clearRetryAttempt(stateVariable: string): void {
  pm.collectionVariables.unset(stateVariable);
}
