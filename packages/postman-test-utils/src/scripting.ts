import { isRecord } from "./internal.js";
import type {
  PostmanCollection,
  PostmanEvent,
  PostmanItem,
  ScriptListener,
} from "./types.js";

export interface ScriptHelper {
  name: string;
  body: string;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function buildHelperPrelude(helpers: readonly ScriptHelper[]): string {
  for (const helper of helpers) {
    if (!IDENTIFIER.test(helper.name)) {
      throw new Error(
        `Invalid helper name "${helper.name}". Expected a JavaScript identifier.`,
      );
    }
  }
  if (helpers.length === 0) {
    return "";
  }
  const lines = [
    "/* postman-test-utils helper prelude */",
    "(function () {",
    "  if (typeof pm === 'undefined') { return; }",
    "  pm.testUtils = pm.testUtils || {};",
  ];
  for (const helper of helpers) {
    lines.push(`  pm.testUtils[${JSON.stringify(helper.name)}] = (${helper.body});`);
  }
  lines.push("})();");
  return lines.join("\n");
}

function prependToEvents(
  events: PostmanEvent[],
  prelude: string,
  listeners: readonly ScriptListener[],
): void {
  for (const event of events) {
    if (!listeners.includes(event.listen)) {
      continue;
    }
    const exec = Array.isArray(event.script?.exec) ? event.script.exec : [];
    event.script = { ...event.script, exec: [prelude, ...exec] };
  }
}

function prependToItem(
  item: PostmanItem,
  prelude: string,
  listeners: readonly ScriptListener[],
): void {
  if (Array.isArray(item.event)) {
    prependToEvents(item.event, prelude, listeners);
  }
  if (Array.isArray(item.item)) {
    for (const child of item.item) {
      if (isRecord(child)) {
        prependToItem(child as PostmanItem, prelude, listeners);
      }
    }
  }
}

/**
 * Returns a copy of the collection with the helper prelude prepended to every
 * `prerequest` and `test` script that already exists. Folder items are visited
 * recursively. The input collection is never mutated.
 */
export function withHelpers<T extends PostmanCollection>(
  collection: T,
  helpers: readonly ScriptHelper[],
  listeners: readonly ScriptListener[] = ["prerequest", "test"],
): T {
  const prelude = buildHelperPrelude(helpers);
  if (prelude === "") {
    return collection;
  }
  const clone = structuredClone(collection);
  if (Array.isArray(clone.item)) {
    for (const item of clone.item) {
      prependToItem(item, prelude, listeners);
    }
  }
  if (Array.isArray(clone.event)) {
    prependToEvents(clone.event, prelude, listeners);
  }
  return clone;
}
