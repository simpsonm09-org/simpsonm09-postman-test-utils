import { SecretResolutionError } from "./errors.js";
import {
  defaultCommandRunner,
  findExecutable,
  toSecretValue,
} from "./internal.js";
import type { ProviderOptions, SecretProvider, SecretRef } from "./types.js";

export interface VaultOptions extends ProviderOptions {
  readonly address?: string;
  readonly namespace?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the JSON from `vault kv get -format=json`. KV v2 nests the pairs under
 * `data.data`; KV v1 puts them directly under `data`.
 */
export function parseVaultKvJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SecretResolutionError("vault", "response was not valid JSON");
  }
  const data = isRecord(parsed) ? parsed.data : undefined;
  if (isRecord(data) && isRecord(data.data)) {
    return data.data;
  }
  if (isRecord(data)) {
    return data;
  }
  throw new SecretResolutionError("vault", "response had no data object");
}

/**
 * Reads a single field from a Vault KV path. Authentication comes from the
 * `VAULT_TOKEN` and `VAULT_ADDR` environment variables, so no token ever
 * appears in a command argument.
 */
export function vaultProvider(options: VaultOptions = {}): SecretProvider {
  const run = options.command ?? defaultCommandRunner;
  const command =
    options.command !== undefined
      ? "vault"
      : findExecutable("vault", options.path);

  return {
    id: "vault",
    async isAvailable(): Promise<boolean> {
      return command !== null;
    },
    async read(ref: SecretRef) {
      if (ref.provider !== "vault") {
        throw new SecretResolutionError(
          "vault",
          `cannot read a "${ref.provider}" reference`,
        );
      }
      if (command === null) {
        throw new SecretResolutionError(
          "vault",
          "the vault CLI was not found on PATH",
        );
      }
      const args: string[] = [];
      if (options.address !== undefined) {
        args.push(`-address=${options.address}`);
      }
      if (options.namespace !== undefined) {
        args.push(`-namespace=${options.namespace}`);
      }
      args.push("kv", "get", "-format=json", ref.path);
      const { stdout } = await run(command, args);
      const values = parseVaultKvJson(stdout);
      const value = values[ref.field];
      if (typeof value !== "string" || value === "") {
        throw new SecretResolutionError(
          "vault",
          `field "${ref.field}" was not a non-empty string at "${ref.path}"`,
        );
      }
      return toSecretValue(value);
    },
  };
}
