/**
 * request-validation
 *
 * Response validation for Postman collections. The suite is one self-contained
 * factory so the same source can be loaded two ways:
 *
 * 1. In Postman, through `pm.require("@simpsonm09/postman-request-validation")`,
 *    then `validation.execute({ SCENARIO })`.
 * 2. Offline in newman, through the injected prelude, then
 *    `pm.testUtils.requestValidation.execute({ SCENARIO })`.
 *
 * The factory must never reference module scope, because `validationHelpers`
 * serializes it with `Function.prototype.toString` to build the sandbox prelude.
 */

declare const pm: any;

export interface ValidationResult {
  response: any;
  isNoContent: boolean;
}

export interface RequestValidationSuite {
  execute(config?: unknown): ValidationResult;
}

export interface ValidationHelper {
  name: string;
  body: string;
}

/**
 * Every helper lives inside this factory so the serialized form is
 * self-contained. Do not hoist a helper to module scope.
 */
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

  function compileScenarioConfig(rawConfig: any): any {
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

  function assertScenarioKeys(
    value: any,
    allowed: string[],
    label: string,
  ): void {
    Object.keys(value).forEach((key: string) => {
      if (!allowed.includes(key)) {
        throw new Error(`${label} does not support '${key}'.`);
      }
    });
  }

  function compileScenarioStatus(status: any): number[] {
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
      throw new Error(
        "SCENARIO.status.oneOf must contain HTTP status integers.",
      );
    }

    return status.oneOf.slice();
  }

  function compileScenarioExpectations(expect: any, kind: string): any {
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

  function assertScenarioEventShape(expect: any, kind: string): void {
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

  function resolveScenarioArrays(expect: any): any {
    if (expect.arrays !== undefined && expect.arrayContains !== undefined) {
      throw new Error(
        "SCENARIO.response.expect cannot define both arrays and arrayContains.",
      );
    }

    return expect.arrays ?? expect.arrayContains;
  }

  function assertRegexValues(regex: any): void {
    Object.values(regex).forEach((value: any) => {
      if (Object.prototype.toString.call(value) !== "[object RegExp]") {
        throw new Error(
          "SCENARIO.response.expect.regex values must be regular expressions.",
        );
      }
    });
  }

  function assertArrayValues(arrays: any): void {
    Object.values(arrays).forEach((value: any) => {
      if (!Array.isArray(value) || value.some((item: any) => !isObject(item))) {
        throw new Error(
          "SCENARIO.response.expect.arrays values must be arrays of objects.",
        );
      }
    });
  }

  function compileScenarioEvents(expect: any, kind: string): any {
    if (kind === "sse" && Array.isArray(expect.events)) {
      return expect.events.map((event: any, index: number) =>
        compileScenarioEvent(event, index),
      );
    }

    return null;
  }

  function compileScenarioSchema(schema: any): any {
    if (schema === undefined) {
      return null;
    }

    if (!isObject(schema)) {
      throw new Error("SCENARIO.response.expect.schema must be an object.");
    }

    return schema;
  }

  function compileScenarioMap(map: any, label: string): any {
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

  function compileScenarioEvent(event: any, index: number): any {
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

  function compileScenarioVariables(variables: any, kind: string | null): any {
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

  function compileScenarioVariableActions(
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

  function compileScenarioVariableAction(
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

  function assertVariableActionShape(action: any, index: number): void {
    if (!isObject(action)) {
      throw new Error(`SCENARIO.variables action ${index} must be an object.`);
    }
  }

  function assertVariableActionScope(action: any, index: number): void {
    if (action.scope !== "environment" && action.scope !== "collection") {
      throw new Error(
        `SCENARIO.variables action ${index} has an invalid scope.`,
      );
    }
  }

  function assertVariableActionName(action: any, index: number): void {
    if (
      (action.variable !== undefined && action.name !== undefined) ||
      (action.variable === undefined && action.name === undefined)
    ) {
      throw new Error(
        `SCENARIO.variables action ${index} needs a variable name.`,
      );
    }
  }

  function assertVariableName(variable: any, index: number): void {
    if (typeof variable !== "string" || variable.trim() === "") {
      throw new Error(
        `SCENARIO.variables action ${index} needs a variable name.`,
      );
    }
  }

  function validateScenarioSource(
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

  function validateScenarioSourceString(
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

  function validateScenarioEventSource(
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

  function executeScenarioValidations(
    compiled: any,
    options: any = {},
  ): ValidationResult {
    const reportTest =
      options.reportTest ||
      ((name: string, callback: () => void) => pm.test(name, callback));
    const reportSkippedTest =
      options.reportSkippedTest ||
      ((name: string, callback: () => void) => pm.test.skip(name, callback));
    const applyVariableChanges = options.applyVariableChanges !== false;
    const context = readScenarioResponseContext(compiled.kind);

    reportResponseBodyKind(compiled, context, reportTest, reportSkippedTest);

    if (compiled.status.length > 0) {
      reportTest(
        `Response returned one of expected statuses: ${compiled.status.join(", ")}`,
        () => {
          pm.expect(context.status).to.be.oneOf(compiled.status);
        },
      );
    }

    if (
      !context.isNoContent &&
      compiled.kind === "json" &&
      !context.bodyParseError
    ) {
      runScenarioAssertions(context.body, compiled.expectations, reportTest);
    }

    if (
      !context.isNoContent &&
      compiled.kind === "sse" &&
      compiled.expectations.events !== null
    ) {
      runScenarioEvents(
        context.events,
        compiled.expectations.events,
        reportTest,
      );
    }

    processScenarioVariables(
      context,
      compiled,
      reportTest,
      applyVariableChanges,
    );

    return {
      response: scenarioResult(context, compiled),
      isNoContent: context.isNoContent,
    };
  }

  function reportResponseBodyKind(
    compiled: any,
    context: any,
    reportTest: (name: string, callback: () => void) => void,
    reportSkippedTest: (name: string, callback: () => void) => void,
  ): void {
    if (compiled.kind !== null && context.isNoContent) {
      reportSkippedTest(
        `Response body contains valid ${
          compiled.kind === "sse" ? "SSE" : "JSON"
        } (skipped for 204 No Content)`,
        () => {},
      );
      return;
    }

    if (compiled.kind === "json") {
      reportTest("Response body contains valid JSON", () => {
        if (context.bodyParseError) {
          throw new Error("Response was not valid JSON.");
        }
      });
      return;
    }

    if (compiled.kind === "sse") {
      reportTest("Response content type is text/event-stream", () => {
        if (normalizeContentType(context.contentType) !== "text/event-stream") {
          throw new Error("Response content type was not text/event-stream.");
        }
      });
    }
  }

  function scenarioResult(context: any, compiled: any): any {
    if (context.isNoContent) {
      return null;
    }

    if (compiled.kind === "json") {
      return context.body;
    }

    if (compiled.kind === "sse") {
      return context.events[0]?.data ?? null;
    }

    return null;
  }

  function readScenarioResponseContext(kind: string | null): any {
    const isNoContent = pm.response.code === 204;
    const contentType = pm.response.headers?.get("Content-Type") || "";
    const context = {
      status: pm.response.code,
      contentType,
      isNoContent,
      body: null,
      bodyParseError: false,
      events: [] as any[],
    };

    if (isNoContent || kind === null) {
      return context;
    }

    if (kind === "json") {
      try {
        context.body = pm.response.json();
      } catch {
        context.bodyParseError = true;
      }
      return context;
    }

    context.events = decodeScenarioSse(pm.response.text());
    return context;
  }

  function normalizeContentType(value: any): string {
    return String(value || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
  }

  function decodeScenarioSse(rawText: any): any[] {
    const lines = String(rawText || "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    const events: any[] = [];
    let frame: string[] = [];

    const dispatch = () => {
      if (isSkippableFrame(frame)) {
        frame = [];
        return;
      }

      events.push(compileScenarioSseEvent(frame));
      frame = [];
    };

    lines.forEach((line) => {
      if (line === "") {
        dispatch();
      } else {
        frame.push(line);
      }
    });
    dispatch();

    return events;
  }

  function isSkippableFrame(frame: string[]): boolean {
    return frame.length === 0 || frame.every((line) => line.startsWith(":"));
  }

  function compileScenarioSseEvent(frame: string[]): any {
    const parsed: {
      eventName?: string;
      id?: string;
      retry?: number;
      dataLines: string[];
    } = { dataLines: [] };

    frame.forEach((line) => {
      applyScenarioSseLine(line, parsed);
    });

    const dataText = parsed.dataLines.join("\n");
    let data: any;
    let dataParseError = false;

    if (parsed.dataLines.length === 0) {
      dataParseError = true;
    } else {
      try {
        data = JSON.parse(dataText);
      } catch {
        dataParseError = true;
      }
    }

    return {
      name: parsed.eventName === undefined ? "message" : parsed.eventName,
      id: parsed.id,
      retry: parsed.retry,
      data,
      dataText,
      dataParseError,
    };
  }

  function applyScenarioSseLine(
    line: string,
    parsed: {
      eventName?: string;
      id?: string;
      retry?: number;
      dataLines: string[];
    },
  ): void {
    if (line.startsWith(":")) {
      return;
    }

    const { field, value } = parseScenarioSseField(line);

    if (field === "event") {
      parsed.eventName = value;
    } else if (field === "id") {
      parsed.id = value;
    } else if (field === "retry") {
      applyScenarioRetry(value, parsed);
    } else if (field === "data") {
      parsed.dataLines.push(value);
    }
  }

  function parseScenarioSseField(line: string): {
    field: string;
    value: string;
  } {
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const rawValue = colon < 0 ? "" : line.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    return { field, value };
  }

  function applyScenarioRetry(value: string, parsed: { retry?: number }): void {
    if (/^\d+$/.test(value)) {
      parsed.retry = Number(value);
    }
  }

  function runScenarioAssertions(
    subject: any,
    expectations: any,
    reportTest: (name: string, callback: () => void) => void,
  ): void {
    validateSchema(expectations.schema, reportTest, subject);
    validateExpectedValues(
      subject,
      resolveScenarioMap(expectations.values),
      reportTest,
    );
    validateExpectedNotValues(
      subject,
      resolveScenarioMap(expectations.notValues),
      reportTest,
    );
    validateRegexValues(subject, expectations.regex, reportTest);
    validateArrayContains(
      subject,
      resolveScenarioMap(expectations.arrays),
      reportTest,
    );
  }

  function runScenarioEvents(
    events: any[],
    expectations: any[],
    reportTest: (name: string, callback: () => void) => void,
  ): void {
    reportTest(`SSE response contains ${expectations.length} event(s)`, () => {
      pm.expect(events.length).to.equal(expectations.length);
    });

    expectations.forEach((expectation, index) => {
      const event = events[index];

      reportTest(`SSE event ${index} is present`, () => {
        pm.expect(event).to.not.equal(undefined);
      });

      if (!event) {
        return;
      }

      if (expectation.name !== undefined) {
        reportTest(
          `SSE event ${index} name equals '${expectation.name}'`,
          () => {
            pm.expect(event.name).to.equal(expectation.name);
          },
        );
      }

      reportTest(`SSE event ${index} data contains valid JSON`, () => {
        if (event.dataParseError) {
          throw new Error("SSE event data was not valid JSON.");
        }
      });

      if (!event.dataParseError) {
        runScenarioAssertions(event.data, expectation.assertions, reportTest);
      }
    });
  }

  function resolveScenarioMap(map: any): any {
    return Object.fromEntries(
      Object.entries(map).map(([path, value]) => [
        path,
        resolveScenarioValue(value),
      ]),
    );
  }

  function resolveScenarioValue(value: any): any {
    if (isRegularExpression(value)) {
      return value;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 1 &&
      typeof value.variable === "string"
    ) {
      return getScenarioVariable(value.variable);
    }

    if (Array.isArray(value)) {
      return value.map((item) => resolveScenarioValue(item));
    }

    if (isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          resolveScenarioValue(nested),
        ]),
      );
    }

    return value;
  }

  function getScenarioVariable(name: string): any {
    if (pm.variables?.get) {
      return pm.variables.get(name);
    }

    const collectionValue = pm.collectionVariables?.get(name);

    if (collectionValue !== undefined) {
      return collectionValue;
    }

    return pm.environment?.get(name);
  }

  function processScenarioVariables(
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

  function processScenarioEventStorage(
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

  function isObject(value: any): boolean {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isRegularExpression(value: any): boolean {
    return Object.prototype.toString.call(value) === "[object RegExp]";
  }

  function normalizeObject(value: any): any {
    return isObject(value) ? value : {};
  }

  function executeWithPolling(
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

  function normalizeRetryOnWithPolling(retryConfig: any): any {
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

  function normalizeRetryBackoff(retryConfig: any, hasBackoff: boolean): any {
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

  function isValidRetryConfig(
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

  function isPositiveInteger(value: any): boolean {
    return Number.isInteger(value) && value >= 1;
  }

  function isNonNegativeFinite(value: any): boolean {
    return Number.isFinite(value) && value >= 0;
  }

  function hasValidRetryStatuses(statuses: any): boolean {
    return (
      Array.isArray(statuses) &&
      statuses.length > 0 &&
      statuses.every(
        (status: any) =>
          Number.isInteger(status) && status >= 100 && status <= 599,
      )
    );
  }

  function getPollingDelayMs(retryConfig: any, nextAttempt: number): number {
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

  function getRetryStateVariable(): string {
    const requestIdentity =
      pm.info?.requestId || pm.info?.requestName || "current";

    const safeRequestIdentity = String(requestIdentity).replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );

    return `__request_validation_attempt_${safeRequestIdentity}`;
  }

  function getRetryAttempt(stateVariable: string): number {
    const value = pm.collectionVariables.get(stateVariable);
    return Number.isInteger(Number(value)) ? Number(value) : 0;
  }

  function setRetryAttempt(stateVariable: string, attempt: number): void {
    pm.collectionVariables.set(stateVariable, attempt);
  }

  function clearRetryAttempt(stateVariable: string): void {
    pm.collectionVariables.unset(stateVariable);
  }

  function validateSchema(
    schema: any,
    reportTest: (name: string, callback: () => void) => void,
    responseTarget: any = undefined,
  ): void {
    if (!schema) {
      return;
    }

    reportTest("Response matches expected schema", () => {
      if (responseTarget === undefined || responseTarget === pm.response) {
        pm.response.to.have.jsonSchema(schema);
        return;
      }

      if (pm.expect(responseTarget).to?.have?.jsonSchema) {
        pm.expect(responseTarget).to.have.jsonSchema(schema);
        return;
      }

      pm.response.to.have.jsonSchema(schema);
    });
  }

  function validateExpectedValues(
    response: any,
    expectedValues: any,
    reportTest: (name: string, callback: () => void) => void,
  ): void {
    Object.entries(expectedValues).forEach(([field, expected]) => {
      reportTest(`${field} equals '${expected}'`, () => {
        const actual = getValueByPath(response, field);
        validateExists(field, actual);
        validateNotEmpty(field, actual);
        pm.expect(actual).to.equal(expected);
      });
    });
  }

  function validateExpectedNotValues(
    response: any,
    expectedNotValues: any,
    reportTest: (name: string, callback: () => void) => void,
  ): void {
    Object.entries(expectedNotValues).forEach(([field, forbidden]) => {
      reportTest(`${field} does not equal '${forbidden}'`, () => {
        const actual = getValueByPath(response, field);
        validateExists(field, actual);
        validateNotEmpty(field, actual);
        pm.expect(actual).to.not.equal(forbidden);
      });
    });
  }

  function validateRegexValues(
    response: any,
    expectedRegex: any,
    reportTest: (name: string, callback: () => void) => void,
  ): void {
    Object.entries(expectedRegex).forEach(([field, regex]) => {
      reportTest(`${field} matches '${regex}'`, () => {
        const actual = getValueByPath(response, field);
        validateExists(field, actual);
        validateNotEmpty(field, actual);
        pm.expect(String(actual)).to.match(regex);
      });
    });
  }

  function validateArrayContains(
    response: any,
    expectedArrayContains: any,
    reportTest: (name: string, callback: () => void) => void,
  ): void {
    Object.entries(expectedArrayContains).forEach(
      ([arrayPath, expectedItems]) => {
        const actualArray = getValueByPath(response, arrayPath);

        reportTest(`${arrayPath} is an array`, () => {
          validateExists(arrayPath, actualArray);
          pm.expect(actualArray, `${arrayPath} is not an array`).to.be.an(
            "array",
          );
        });

        if (!Array.isArray(actualArray)) {
          return;
        }

        reportTest(`${arrayPath} is not empty`, () => {
          pm.expect(actualArray, `${arrayPath} is empty`).to.not.be.empty;
        });

        if (!Array.isArray(expectedItems)) {
          reportTest(`${arrayPath} expected items is an array`, () => {
            pm.expect(
              expectedItems,
              `${arrayPath} expected items is not an array`,
            ).to.be.an("array");
          });
          return;
        }

        expectedItems.forEach((expectedItem: any, expectedIndex: number) => {
          reportTest(
            `${arrayPath} contains expected item ${expectedIndex}: ${JSON.stringify(
              expectedItem,
            )}`,
            () => {
              const found = actualArray.some((actualItem: any) =>
                expectedItemMatches(actualItem, expectedItem),
              );

              pm.expect(
                found,
                `Expected ${arrayPath} to contain ${JSON.stringify(
                  expectedItem,
                )}`,
              ).to.equal(true);
            },
          );
        });
      },
    );
  }

  function expectedItemMatches(actualItem: any, expectedItem: any): boolean {
    if (
      actualItem === null ||
      actualItem === undefined ||
      expectedItem === null ||
      typeof expectedItem !== "object" ||
      Array.isArray(expectedItem)
    ) {
      return false;
    }

    return Object.entries(expectedItem).every(([field, expectedValue]) =>
      fieldMatchesExpected(actualItem, field, expectedValue),
    );
  }

  function fieldMatchesExpected(
    actualItem: any,
    field: string,
    expectedValue: any,
  ): boolean {
    const actualValue = getValueByPath(actualItem, field);

    if (actualValue === undefined || actualValue === null) {
      return false;
    }

    if (typeof actualValue === "string" && actualValue.trim() === "") {
      return false;
    }

    if (Object.prototype.toString.call(expectedValue) === "[object RegExp]") {
      return (expectedValue as RegExp).test(String(actualValue));
    }

    return actualValue === expectedValue;
  }

  function processVariableStorage(
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

  function processVariableClears(
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

  function getValueByPath(object: any, path: string): any {
    return path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .reduce((obj, key) => obj?.[key], object);
  }

  function validateExists(field: string, value: any): void {
    pm.expect(value, `${field} is missing`).to.not.equal(undefined);
    pm.expect(value, `${field} is null`).to.not.equal(null);
  }

  function validateNotEmpty(field: string, value: any): void {
    if (typeof value === "string") {
      pm.expect(value.trim(), `${field} is empty`).to.not.equal("");
    }
  }

  return { execute };
}

/** Runs the suite against the current Postman response. */
export function execute(config?: unknown): ValidationResult {
  return createRequestValidationSuite().execute(config);
}

/**
 * The suite as an injectable script helper. `withHelpers` assigns the returned
 * body to `pm.testUtils[name]`, so a collection script can call
 * `pm.testUtils.requestValidation.execute(...)` offline in newman.
 */
export function validationHelpers(): readonly ValidationHelper[] {
  return [
    {
      name: "requestValidation",
      body: `(${createRequestValidationSuite.toString()})()`,
    },
  ];
}

export default { execute, createRequestValidationSuite, validationHelpers };
