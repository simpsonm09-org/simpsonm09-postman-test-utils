/** Compiles a declarative SCENARIO block into a normalized, validated form. */

import { assertScenarioKeys, isObject } from "./internal.js";
import { compileScenarioVariables } from "./variables-compile.js";

export function compileScenarioConfig(rawConfig: any): any {
  if (!isObject(rawConfig)) {
    throw new Error("SCENARIO configuration must be an object.");
  }

  const scenario = rawConfig.SCENARIO;

  if (!isObject(scenario)) {
    throw new Error("SCENARIO must be an object.");
  }

  const allowedRootKeys = ["SCENARIO", "RETRY_ON_WITH_POLLING"];

  Object.keys(rawConfig).forEach((key: string) => {
    if (!allowedRootKeys.includes(key)) {
      throw new Error(`SCENARIO configuration does not support '${key}'.`);
    }
  });

  const scenarioKeys = ["status", "response", "variables"];

  assertScenarioKeys(scenario, scenarioKeys, "SCENARIO");

  const status = compileScenarioStatus(scenario.status);

  const response = scenario.response;

  if (response === undefined) {
    return {
      kind: null,
      status,
      expectations: null,
      variables: compileScenarioVariables(scenario.variables, null),
    };
  }

  if (!isObject(response)) {
    throw new Error("SCENARIO.response must be an object when supplied.");
  }

  assertScenarioKeys(response, ["kind", "expect"], "SCENARIO.response");

  if (response.kind !== "json" && response.kind !== "sse") {
    throw new Error("SCENARIO.response.kind must be 'json' or 'sse'.");
  }

  const expectations = compileScenarioExpectations(
    response.expect,
    response.kind,
  );

  const variables = compileScenarioVariables(
    scenario.variables,
    response.kind,
  );

  return {
    kind: response.kind,
    status,
    expectations,
    variables,
  };
}

export function compileScenarioStatus(status: any): number[] {
  if (status === undefined) {
    return [];
  }

  if (!isObject(status)) {
    throw new Error("SCENARIO.status must be an object.");
  }

  assertScenarioKeys(status, ["oneOf"], "SCENARIO.status");

  if (
    !Array.isArray(status.oneOf) ||
    status.oneOf.length === 0 ||
    status.oneOf.some(
      (value: any) => !Number.isInteger(value) || value < 100 || value > 599,
    )
  ) {
    throw new Error("SCENARIO.status.oneOf must contain HTTP status integers.");
  }

  return status.oneOf.slice();
}

export function compileScenarioExpectations(expect: any, kind: string): any {
  if (expect === undefined || expect === null) {
    return {
      schema: null,
      values: {},
      notValues: {},
      regex: {},
      arrays: {},
      events: null,
    };
  }

  if (!isObject(expect)) {
    throw new Error("SCENARIO.response.expect must be an object.");
  }

  const allowedKeys = [
    "schema",
    "values",
    "notValues",
    "regex",
    "arrays",
    "arrayContains",
    "events",
  ];

  assertScenarioKeys(expect, allowedKeys, "SCENARIO.response.expect");
  assertScenarioEventShape(expect, kind);

  const arrays = resolveScenarioArrays(expect);
  const regex = compileScenarioMap(expect.regex, "regex");
  const compiledArrays = compileScenarioMap(arrays, "arrays");

  assertRegexValues(regex);
  assertArrayValues(compiledArrays);

  return {
    schema: compileScenarioSchema(expect.schema),
    values: compileScenarioMap(expect.values, "values"),
    notValues: compileScenarioMap(expect.notValues, "notValues"),
    regex,
    arrays: compiledArrays,
    events: compileScenarioEvents(expect, kind),
  };
}

export function assertScenarioEventShape(expect: any, kind: string): void {
  if (
    kind === "sse" &&
    expect.events !== undefined &&
    !Array.isArray(expect.events)
  ) {
    throw new Error(
      "SCENARIO.response.expect.events must be an array for SSE.",
    );
  }

  if (kind === "json" && expect.events !== undefined) {
    throw new Error("SCENARIO.response.expect.events is only valid for SSE.");
  }
}

export function resolveScenarioArrays(expect: any): any {
  if (expect.arrays !== undefined && expect.arrayContains !== undefined) {
    throw new Error(
      "SCENARIO.response.expect cannot define both arrays and arrayContains.",
    );
  }

  return expect.arrays ?? expect.arrayContains;
}

export function assertRegexValues(regex: any): void {
  Object.values(regex).forEach((value: any) => {
    if (Object.prototype.toString.call(value) !== "[object RegExp]") {
      throw new Error(
        "SCENARIO.response.expect.regex values must be regular expressions.",
      );
    }
  });
}

export function assertArrayValues(arrays: any): void {
  Object.values(arrays).forEach((value: any) => {
    if (!Array.isArray(value) || value.some((item: any) => !isObject(item))) {
      throw new Error(
        "SCENARIO.response.expect.arrays values must be arrays of objects.",
      );
    }
  });
}

export function compileScenarioEvents(expect: any, kind: string): any {
  if (kind === "sse" && Array.isArray(expect.events)) {
    return expect.events.map((event: any, index: number) =>
      compileScenarioEvent(event, index),
    );
  }

  return null;
}

export function compileScenarioSchema(schema: any): any {
  if (schema === undefined) {
    return null;
  }

  if (!isObject(schema)) {
    throw new Error("SCENARIO.response.expect.schema must be an object.");
  }

  return schema;
}

export function compileScenarioMap(map: any, label: string): any {
  if (map === undefined) {
    return {};
  }

  if (!isObject(map)) {
    throw new Error(`SCENARIO.response.expect.${label} must be an object.`);
  }

  Object.keys(map).forEach((path: string) => {
    if (path.trim() === "") {
      throw new Error(
        `SCENARIO.response.expect.${label} contains an empty path.`,
      );
    }
  });

  return map;
}

export function compileScenarioEvent(event: any, index: number): any {
  if (!isObject(event)) {
    throw new Error(
      `SCENARIO.response.expect.events[${index}] must be an object.`,
    );
  }

  assertScenarioKeys(
    event,
    ["name", "data"],
    `SCENARIO.response.expect.events[${index}]`,
  );

  if (
    event.name !== undefined &&
    (typeof event.name !== "string" || event.name.trim() === "")
  ) {
    throw new Error(
      `SCENARIO.response.expect.events[${index}].name must be non-empty when supplied.`,
    );
  }

  if (!isObject(event.data)) {
    throw new Error(
      `SCENARIO.response.expect.events[${index}].data must be an object.`,
    );
  }

  assertScenarioKeys(
    event.data,
    ["schema", "values", "notValues", "regex", "arrays", "arrayContains"],
    `SCENARIO.response.expect.events[${index}].data`,
  );

  return {
    name: event.name,
    assertions: compileScenarioExpectations(event.data, "json"),
  };
}
