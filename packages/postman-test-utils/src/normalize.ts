import type { SecretBinding, SecretRef } from "@simpsonm09/postman-secrets";
import { InvalidRunRequestError } from "./errors.js";
import { isRecord } from "./internal.js";
import type {
  CollectionSource,
  NormalizedRunRequest,
  ScriptListener,
  ValidationRequest,
  VariablesSource,
} from "./types.js";

const SECRET_PROVIDERS = ["env", "vault", "infisical"] as const;

function readCollection(value: unknown): CollectionSource {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.item)) {
    return value as unknown as CollectionSource;
  }
  throw new InvalidRunRequestError(
    "collection",
    "expected a file path or a collection object with an item array",
  );
}

function readVariables(value: unknown, field: string): VariablesSource {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.values)) {
    return value as unknown as VariablesSource;
  }
  throw new InvalidRunRequestError(
    field,
    "expected a file path or an environment object with a values array",
  );
}

function readOptionalVariables(
  value: unknown,
  field: string,
): VariablesSource | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readVariables(value, field);
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && value !== "") {
    return value;
  }
  throw new InvalidRunRequestError(field, "expected a non-empty string");
}

function readFolder(value: unknown): string | string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry !== "")
  ) {
    return value as string[];
  }
  throw new InvalidRunRequestError(
    "folder",
    "expected a folder name or a non-empty array of folder names",
  );
}

function readReporters(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry !== "")
  ) {
    return value as string[];
  }
  throw new InvalidRunRequestError(
    "reporters",
    "expected an array of reporter names",
  );
}

function readPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new InvalidRunRequestError(field, "expected a positive number");
}

function readBail(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new InvalidRunRequestError("bail", "expected a boolean");
}

function readSecretRef(value: unknown, field: string): SecretRef {
  if (!isRecord(value)) {
    throw new InvalidRunRequestError(
      field,
      "expected a secret reference object",
    );
  }
  const provider = value.provider;
  if (
    typeof provider !== "string" ||
    !(SECRET_PROVIDERS as readonly string[]).includes(provider)
  ) {
    throw new InvalidRunRequestError(
      field,
      `expected a provider of ${SECRET_PROVIDERS.join(", ")}`,
    );
  }
  switch (provider) {
    case "env":
      if (typeof value.name !== "string" || value.name === "") {
        throw new InvalidRunRequestError(field, "expected an env name");
      }
      return { provider: "env", name: value.name };
    case "vault":
      if (
        typeof value.path !== "string" ||
        value.path === "" ||
        typeof value.field !== "string" ||
        value.field === ""
      ) {
        throw new InvalidRunRequestError(
          field,
          "expected a vault path and field",
        );
      }
      return { provider: "vault", path: value.path, field: value.field };
    case "infisical": {
      if (typeof value.key !== "string" || value.key === "") {
        throw new InvalidRunRequestError(field, "expected an infisical key");
      }
      const ref: SecretRef = { provider: "infisical", key: value.key };
      return ref;
    }
    default:
      throw new InvalidRunRequestError(field, "unsupported provider");
  }
}

function readSecrets(value: unknown): SecretBinding[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvalidRunRequestError(
      "secrets",
      "expected an array of bindings",
    );
  }
  return value.map((entry, index) => {
    const field = `secrets[${index}]`;
    if (!isRecord(entry)) {
      throw new InvalidRunRequestError(field, "expected an object");
    }
    if (typeof entry.variable !== "string" || entry.variable === "") {
      throw new InvalidRunRequestError(field, "expected a variable name");
    }
    if (
      entry.scope !== undefined &&
      entry.scope !== "environment" &&
      entry.scope !== "globals"
    ) {
      throw new InvalidRunRequestError(
        field,
        "expected a scope of environment or globals",
      );
    }
    return {
      variable: entry.variable,
      secret: readSecretRef(entry.secret, `${field}.secret`),
      ...(entry.scope === undefined ? {} : { scope: entry.scope }),
    } satisfies SecretBinding;
  });
}

function readValidation(value: unknown): ValidationRequest | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new InvalidRunRequestError("validation", "expected an object");
  }
  if (value.suite !== undefined && value.suite !== "request-validation") {
    throw new InvalidRunRequestError(
      "validation.suite",
      "expected request-validation",
    );
  }
  let listeners: ScriptListener[] | undefined;
  if (value.listeners !== undefined) {
    if (
      !Array.isArray(value.listeners) ||
      value.listeners.some(
        (entry) => entry !== "prerequest" && entry !== "test",
      )
    ) {
      throw new InvalidRunRequestError(
        "validation.listeners",
        "expected an array of prerequest or test",
      );
    }
    listeners = value.listeners as ScriptListener[];
  }
  return {
    suite: "request-validation",
    ...(listeners === undefined ? {} : { listeners }),
  };
}

export function normalizeRunRequest(input: unknown): NormalizedRunRequest {
  if (!isRecord(input)) {
    throw new InvalidRunRequestError("request", "expected an object");
  }
  return {
    collection: readCollection(input.collection),
    environment: readOptionalVariables(input.environment, "environment"),
    globals: readOptionalVariables(input.globals, "globals"),
    iterationData: readOptionalString(input.iterationData, "iterationData"),
    folder: readFolder(input.folder),
    reporters: readReporters(input.reporters),
    timeoutRequestMs: readPositiveNumber(
      input.timeoutRequestMs,
      "timeoutRequestMs",
    ),
    bail: readBail(input.bail),
    secrets: readSecrets(input.secrets),
    validation: readValidation(input.validation),
  };
}
