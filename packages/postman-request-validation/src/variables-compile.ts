/** Compiles SCENARIO.variables save and clear actions. */

import { assertScenarioKeys, isObject } from "./internal.js";

export function compileScenarioVariables(
  variables: any,
  kind: string | null,
): any {
  if (variables === undefined || variables === null) {
    return { save: [], clear: [] };
  }

  if (!isObject(variables)) {
    throw new Error("SCENARIO.variables must be an object.");
  }

  assertScenarioKeys(variables, ["save", "clear"], "SCENARIO.variables");

  const save = compileScenarioVariableActions(variables.save, true, kind);
  const clear = compileScenarioVariableActions(variables.clear, false, kind);

  return { save, clear };
}

export function compileScenarioVariableActions(
  actions: any,
  isSave: boolean,
  kind: string | null,
): any[] {
  if (actions === undefined) {
    return [];
  }

  if (!Array.isArray(actions)) {
    throw new Error(
      `SCENARIO.variables.${isSave ? "save" : "clear"} must be an array.`,
    );
  }

  return actions.map((action: any, index: number) =>
    compileScenarioVariableAction(action, index, isSave, kind),
  );
}

export function compileScenarioVariableAction(
  action: any,
  index: number,
  isSave: boolean,
  kind: string | null,
): any {
  assertVariableActionShape(action, index);

  const allowed = isSave
    ? ["scope", "variable", "name", "source", "from"]
    : ["scope", "variable", "name"];

  assertScenarioKeys(
    action,
    allowed,
    `SCENARIO.variables.${isSave ? "save" : "clear"}[${index}]`,
  );
  assertVariableActionScope(action, index);
  assertVariableActionName(action, index);

  const variable = action.variable ?? action.name;
  const source = action.source ?? action.from;

  assertVariableName(variable, index);

  if (isSave) {
    validateScenarioSource(source, index, kind);
  }

  return { scope: action.scope, variable, source };
}

export function assertVariableActionShape(action: any, index: number): void {
  if (!isObject(action)) {
    throw new Error(`SCENARIO.variables action ${index} must be an object.`);
  }
}

export function assertVariableActionScope(action: any, index: number): void {
  if (action.scope !== "environment" && action.scope !== "collection") {
    throw new Error(`SCENARIO.variables action ${index} has an invalid scope.`);
  }
}

export function assertVariableActionName(action: any, index: number): void {
  if (
    (action.variable !== undefined && action.name !== undefined) ||
    (action.variable === undefined && action.name === undefined)
  ) {
    throw new Error(
      `SCENARIO.variables action ${index} needs a variable name.`,
    );
  }
}

export function assertVariableName(variable: any, index: number): void {
  if (typeof variable !== "string" || variable.trim() === "") {
    throw new Error(
      `SCENARIO.variables action ${index} needs a variable name.`,
    );
  }
}

export function validateScenarioSource(
  source: any,
  index: number,
  kind: string | null,
): void {
  if (typeof source === "string") {
    validateScenarioSourceString(source, index, kind);
    return;
  }

  if (!isObject(source)) {
    throw new Error(
      `SCENARIO.variables.save[${index}].source must be a path or event source.`,
    );
  }

  validateScenarioEventSource(source, index, kind);
}

export function validateScenarioSourceString(
  source: string,
  index: number,
  kind: string | null,
): void {
  if (source.trim() === "") {
    throw new Error(
      `SCENARIO.variables.save[${index}].source must not be empty.`,
    );
  }

  if (kind === null) {
    throw new Error(
      `SCENARIO.variables.save[${index}].source requires SCENARIO.response.`,
    );
  }

  if (kind === "sse") {
    throw new Error(
      `SCENARIO.variables.save[${index}].source must use an event source for SSE.`,
    );
  }
}

export function validateScenarioEventSource(
  source: any,
  index: number,
  kind: string | null,
): void {
  if (kind === null) {
    throw new Error(
      `SCENARIO.variables.save[${index}].source requires SCENARIO.response.`,
    );
  }

  assertScenarioKeys(
    source,
    ["event", "data"],
    `SCENARIO.variables.save[${index}].source`,
  );

  if (kind !== "sse") {
    throw new Error(
      `SCENARIO.variables.save[${index}].source event sources are only valid for SSE.`,
    );
  }

  if (
    !Number.isInteger(source.event) ||
    source.event < 0 ||
    typeof source.data !== "string" ||
    source.data.trim() === ""
  ) {
    throw new Error(
      `SCENARIO.variables.save[${index}].source must contain an event index and data path.`,
    );
  }
}
