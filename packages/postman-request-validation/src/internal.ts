/** Shared guards and path helpers used across the suite. */

export function isObject(value: any): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isRegularExpression(value: any): boolean {
  return Object.prototype.toString.call(value) === "[object RegExp]";
}

export function normalizeObject(value: any): any {
  return isObject(value) ? value : {};
}

export function assertScenarioKeys(
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

export function getValueByPath(object: any, path: string): any {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce((obj, key) => obj?.[key], object);
}

export function validateExists(field: string, value: any): void {
  pm.expect(value, `${field} is missing`).to.not.equal(undefined);
  pm.expect(value, `${field} is null`).to.not.equal(null);
}

export function validateNotEmpty(field: string, value: any): void {
  if (typeof value === "string") {
    pm.expect(value.trim(), `${field} is empty`).to.not.equal("");
  }
}
