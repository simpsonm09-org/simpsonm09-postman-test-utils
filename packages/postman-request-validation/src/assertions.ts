/** Reports response assertions for a compiled expectation set. */

import {
  getValueByPath,
  isObject,
  isRegularExpression,
  validateExists,
  validateNotEmpty,
} from "./internal.js";

export function runScenarioAssertions(
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

export function runScenarioEvents(
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
      reportTest(`SSE event ${index} name equals '${expectation.name}'`, () => {
        pm.expect(event.name).to.equal(expectation.name);
      });
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

export function resolveScenarioMap(map: any): any {
  return Object.fromEntries(
    Object.entries(map).map(([path, value]) => [
      path,
      resolveScenarioValue(value),
    ]),
  );
}

export function resolveScenarioValue(value: any): any {
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

export function getScenarioVariable(name: string): any {
  if (pm.variables?.get) {
    return pm.variables.get(name);
  }

  const collectionValue = pm.collectionVariables?.get(name);

  if (collectionValue !== undefined) {
    return collectionValue;
  }

  return pm.environment?.get(name);
}

export function validateSchema(
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

export function validateExpectedValues(
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

export function validateExpectedNotValues(
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

export function validateRegexValues(
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

export function validateArrayContains(
  response: any,
  expectedArrayContains: any,
  reportTest: (name: string, callback: () => void) => void,
): void {
  Object.entries(expectedArrayContains).forEach(([arrayPath, expectedItems]) => {
    const actualArray = getValueByPath(response, arrayPath);

    reportTest(`${arrayPath} is an array`, () => {
      validateExists(arrayPath, actualArray);
      pm.expect(actualArray, `${arrayPath} is not an array`).to.be.an("array");
    });

    if (!Array.isArray(actualArray)) {
      return;
    }

    reportTest(`${arrayPath} is not empty`, () => {
      pm.expect(actualArray.length, `${arrayPath} is empty`).to.not.equal(0);
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
            `Expected ${arrayPath} to contain ${JSON.stringify(expectedItem)}`,
          ).to.equal(true);
        },
      );
    });
  });
}

export function expectedItemMatches(actualItem: any, expectedItem: any): boolean {
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

export function fieldMatchesExpected(
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
