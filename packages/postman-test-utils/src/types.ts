import type { SecretBinding } from "@simpsonm09/postman-secrets";

export type ScriptListener = "prerequest" | "test";

export interface PostmanScript {
  type?: string;
  exec: string[];
}

export interface PostmanEvent {
  listen: ScriptListener;
  script?: PostmanScript;
}

export interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  event?: PostmanEvent[];
  [key: string]: unknown;
}

export interface PostmanCollection {
  info: { name: string; schema?: string };
  item: PostmanItem[];
  event?: PostmanEvent[];
  [key: string]: unknown;
}

export interface PostmanVariable {
  key: string;
  value: unknown;
  enabled?: boolean;
  type?: string;
}

export interface PostmanVariables {
  name?: string;
  values: PostmanVariable[];
  [key: string]: unknown;
}

export type CollectionSource = string | PostmanCollection;

export type VariablesSource = string | PostmanVariables;

export interface ScriptHelper {
  name: string;
  body: string;
}

export interface ValidationRequest {
  /** Only `request-validation` is shipped today. */
  readonly suite?: "request-validation";
  /** Listeners to prepend the prelude to. Defaults to both. */
  readonly listeners?: readonly ScriptListener[];
}

export interface RunRequest {
  /** A v2.1 collection file path or an inline collection object. */
  readonly collection: CollectionSource;
  readonly environment?: VariablesSource;
  readonly globals?: VariablesSource;
  readonly iterationData?: string;
  readonly folder?: string | readonly string[];
  readonly reporters?: readonly string[];
  readonly timeoutRequestMs?: number;
  readonly bail?: boolean;
  /** Secrets resolved in memory and merged into the run environment. */
  readonly secrets?: readonly SecretBinding[];
  /** Injects the request-validation suite as a script prelude. */
  readonly validation?: ValidationRequest;
}

export interface NormalizedRunRequest {
  readonly collection: CollectionSource;
  readonly environment?: VariablesSource;
  readonly globals?: VariablesSource;
  readonly iterationData?: string;
  readonly folder?: string | readonly string[];
  readonly reporters?: readonly string[];
  readonly timeoutRequestMs?: number;
  readonly bail?: boolean;
  readonly secrets: readonly SecretBinding[];
  readonly validation?: ValidationRequest;
}

/** The fully resolved request handed to the newman adapter. */
export interface PreparedRunRequest {
  readonly collection: CollectionSource;
  readonly environment?: VariablesSource;
  readonly globals?: VariablesSource;
  readonly iterationData?: string;
  readonly folder?: string | readonly string[];
  readonly reporters?: readonly string[];
  readonly timeoutRequestMs?: number;
  readonly bail?: boolean;
}

export interface RunStats {
  iterations: number;
  requests: number;
  assertions: number;
  failedAssertions: number;
  durationMs: number;
}

export interface RunFailure {
  item: string;
  message: string;
  test: string | null;
  at: string | null;
}

export interface RunResult {
  runner: "newman";
  success: boolean;
  stats: RunStats;
  failures: RunFailure[];
}
