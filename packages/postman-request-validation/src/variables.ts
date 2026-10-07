/** Saves and clears variables from the response and from SSE events. */

import {
  getValueByPath,
  validateExists,
  validateNotEmpty,
} from "./internal.js";

export function processScenarioVariables(
  context: any,
  compiled: any,
  reportTest: (name: string, callback: () => void) => void,
  applyVariableChanges: boolean,
): void {
  const environmentMappings: Record<string, string> = {};
  const collectionMappings: Record<string, string> = {};

  if (!context.isNoContent) {
    compiled.variables.save.forEach((action: any) => {
      if (typeof action.source === "string") {
        const mappings =
          action.scope === "environment"
            ? environmentMappings
            : collectionMappings;
        mappings[action.source] = action.variable;
      } else {
        processScenarioEventStorage(
          context,
          action,
          reportTest,
          applyVariableChanges,
        );
      }
    });

    processVariableStorage(
      context.body,
      environmentMappings,
      (key: string) => pm.environment.get(key),
      (key: string, value: any) => pm.environment.set(key, value),
      "environment",
      reportTest,
      applyVariableChanges,
    );
    processVariableStorage(
      context.body,
      collectionMappings,
      (key: string) => pm.collectionVariables.get(key),
      (key: string, value: any) => pm.collectionVariables.set(key, value),
      "collection",
      reportTest,
      applyVariableChanges,
    );
  }

  const environmentClears = compiled.variables.clear
    .filter((action: any) => action.scope === "environment")
    .map((action: any) => action.variable);
  const collectionClears = compiled.variables.clear
    .filter((action: any) => action.scope === "collection")
    .map((action: any) => action.variable);

  processVariableClears(
    environmentClears,
    (key: string) => pm.environment.get(key),
    (key: string, value: any) => pm.environment.set(key, value),
    "environment",
    reportTest,
    applyVariableChanges,
  );
  processVariableClears(
    collectionClears,
    (key: string) => pm.collectionVariables.get(key),
    (key: string, value: any) => pm.collectionVariables.set(key, value),
    "collection",
    reportTest,
    applyVariableChanges,
  );
}

export function processScenarioEventStorage(
  context: any,
  action: any,
  reportTest: (name: string, callback: () => void) => void,
  applyVariableChanges: boolean,
): void {
  const event = context.events[action.source.event];
  const getter =
    action.scope === "environment"
      ? (key: string) => pm.environment.get(key)
      : (key: string) => pm.collectionVariables.get(key);
  const setter =
    action.scope === "environment"
      ? (key: string, value: any) => pm.environment.set(key, value)
      : (key: string, value: any) => pm.collectionVariables.set(key, value);

  processVariableStorage(
    event?.data,
    { [action.source.data]: action.variable },
    getter,
    setter,
    action.scope,
    reportTest,
    applyVariableChanges,
  );
}

export function processVariableStorage(
  response: any,
  variables: any,
  getter: (key: string) => any,
  setter: (key: string, value: any) => void,
  variableType: string,
  reportTest: (name: string, callback: () => void) => void,
  applyVariableChanges: boolean,
): void {
  Object.entries(variables).forEach(([responsePath, variableName]) => {
    const value = getValueByPath(response, responsePath);

    reportTest(`${responsePath} exists for storage`, () => {
      validateExists(responsePath, value);
      validateNotEmpty(responsePath, value);
    });

    if (value !== undefined && value !== null) {
      if (applyVariableChanges) {
        setter(variableName as string, value);
      }

      reportTest(
        `${responsePath} stored in ${variableType} variable ${variableName}`,
        () => {
          if (!applyVariableChanges) {
            return;
          }
          pm.expect(getter(variableName as string)).to.equal(String(value));
        },
      );
    }
  });
}

export function processVariableClears(
  variables: string[],
  getter: (key: string) => any,
  setter: (key: string, value: any) => void,
  variableType: string,
  reportTest: (name: string, callback: () => void) => void,
  applyVariableChanges: boolean,
): void {
  variables.forEach((variableName) => {
    if (applyVariableChanges) {
      setter(variableName, "");
    }

    reportTest(`${variableType} variable ${variableName} was cleared`, () => {
      if (!applyVariableChanges) {
        return;
      }
      pm.expect(getter(variableName)).to.equal("");
    });
  });
}
