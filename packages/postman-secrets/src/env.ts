import { SecretResolutionError } from "./errors.js";
import { toSecretValue } from "./internal.js";
import type { ProviderOptions, SecretProvider, SecretRef } from "./types.js";

/**
 * Reads secrets that are already present in the process environment. Covers
 * values injected upstream by an Infisical or Vault CI action.
 */
export function envProvider(options: ProviderOptions = {}): SecretProvider {
  const env = options.env ?? process.env;
  return {
    id: "env",
    async isAvailable(): Promise<boolean> {
      return true;
    },
    async read(ref: SecretRef) {
      if (ref.provider !== "env") {
        throw new SecretResolutionError(
          "env",
          `cannot read a "${ref.provider}" reference`,
        );
      }
      const value = env[ref.name];
      if (value === undefined || value === "") {
        throw new SecretResolutionError(
          "env",
          `environment variable "${ref.name}" is not set`,
        );
      }
      return toSecretValue(value);
    },
  };
}
