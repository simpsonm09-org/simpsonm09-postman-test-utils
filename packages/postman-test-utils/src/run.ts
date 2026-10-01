import { readFile, writeFile } from "node:fs/promises";
import { resolveSecrets, reveal } from "@simpsonm09/postman-secrets";
import type { ResolvedBinding } from "@simpsonm09/postman-secrets";
import { validationHelpers } from "@simpsonm09/postman-request-validation";
import { InvalidRunRequestError } from "./errors.js";
import { normalizeRunRequest } from "./normalize.js";
import { runNewman } from "./runners/newman.js";
import { withHelpers } from "./scripting.js";
import type {
  CollectionSource,
  NormalizedRunRequest,
  PostmanCollection,
  PostmanVariables,
  PreparedRunRequest,
  RunRequest,
  RunResult,
  VariablesSource,
  ValidationRequest,
} from "./types.js";

/**
 * Run a Postman v2.1 collection offline through newman. Secrets are resolved in
 * memory and merged into the environment, and the request-validation suite can
 * be injected as a prelude.
 */
export async function runCollection(request: RunRequest): Promise<RunResult> {
  const normalized = normalizeRunRequest(request);
  const prepared = await prepareRunRequest(normalized);
  return runNewman(prepared);
}

/** Resolve secrets, merge them into variables, and inject validation. */
export async function prepareRunRequest(
  normalized: NormalizedRunRequest,
): Promise<PreparedRunRequest> {
  const bindings =
    normalized.secrets.length > 0
      ? (await resolveSecrets(normalized.secrets)).bindings
      : [];
  const environment = await mergeBindings(
    normalized.environment,
    bindings.filter((binding) => binding.scope === "environment"),
  );
  const globals = await mergeBindings(
    normalized.globals,
    bindings.filter((binding) => binding.scope === "globals"),
  );
  const collection = await applyValidation(
    normalized.collection,
    normalized.validation,
  );

  return {
    collection,
    ...(environment === undefined ? {} : { environment }),
    ...(globals === undefined ? {} : { globals }),
    ...(normalized.iterationData === undefined
      ? {}
      : { iterationData: normalized.iterationData }),
    ...(normalized.folder === undefined ? {} : { folder: normalized.folder }),
    ...(normalized.reporters === undefined
      ? {}
      : { reporters: normalized.reporters }),
    ...(normalized.timeoutRequestMs === undefined
      ? {}
      : { timeoutRequestMs: normalized.timeoutRequestMs }),
    ...(normalized.bail === undefined ? {} : { bail: normalized.bail }),
  };
}

/**
 * Write a collection with the validation prelude baked in, so plain
 * `newman run <file>` can use the suite without the engine. Secrets are never
 * written, so a file emitted from a config that has secrets stays clean.
 */
export async function emitCollection(
  request: RunRequest,
  path: string,
): Promise<string> {
  const normalized = normalizeRunRequest(request);
  const collection =
    typeof normalized.collection === "string"
      ? await parseJsonFile<PostmanCollection>(
          normalized.collection,
          "collection",
        )
      : normalized.collection;
  const augmented =
    normalized.validation === undefined
      ? collection
      : withHelpers(
          collection,
          validationHelpers(),
          normalized.validation.listeners ?? ["prerequest", "test"],
        );
  await writeFile(path, `${JSON.stringify(augmented, null, 2)}\n`, "utf8");
  return path;
}

async function mergeBindings(
  base: VariablesSource | undefined,
  bindings: readonly ResolvedBinding[],
): Promise<VariablesSource | undefined> {
  if (bindings.length === 0) {
    return base;
  }
  const variables = (await loadVariables(base)) ?? { values: [] };
  const names = new Set(bindings.map((binding) => binding.variable));
  const values = variables.values.filter((entry) => !names.has(entry.key));
  for (const binding of bindings) {
    values.push({
      key: binding.variable,
      value: reveal(binding.value),
      enabled: true,
    });
  }
  return { ...variables, values };
}

async function loadVariables(
  source: VariablesSource | undefined,
): Promise<PostmanVariables | undefined> {
  if (source === undefined) {
    return undefined;
  }
  if (typeof source !== "string") {
    return source;
  }
  return parseJsonFile<PostmanVariables>(source, "variables");
}

async function applyValidation(
  collection: CollectionSource,
  validation: ValidationRequest | undefined,
): Promise<CollectionSource> {
  if (validation === undefined) {
    return collection;
  }
  const object =
    typeof collection === "string"
      ? await parseJsonFile<PostmanCollection>(collection, "collection")
      : collection;
  return withHelpers(
    object,
    validationHelpers(),
    validation.listeners ?? ["prerequest", "test"],
  );
}

async function parseJsonFile<T>(path: string, label: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new InvalidRunRequestError(
      label,
      `could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new InvalidRunRequestError(label, `${path} is not valid JSON`);
  }
}
