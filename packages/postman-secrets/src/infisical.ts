import { SecretResolutionError } from "./errors.js";
import {
  defaultCommandRunner,
  findExecutable,
  toSecretValue,
} from "./internal.js";
import type { ProviderOptions, SecretProvider, SecretRef } from "./types.js";

export interface InfisicalOptions extends ProviderOptions {
  readonly environment?: string;
  readonly path?: string;
  readonly projectId?: string;
}

/** Parse `infisical export --format=dotenv-export` output. */
export function parseDotenvExport(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/**
 * Reads a single secret through `infisical secrets get`. Authentication comes
 * from `INFISICAL_TOKEN` in the environment.
 */
export function infisicalProvider(
  options: InfisicalOptions = {},
): SecretProvider {
  const run = options.command ?? defaultCommandRunner;
  const command =
    options.command !== undefined
      ? "infisical"
      : findExecutable("infisical", options.path);

  return {
    id: "infisical",
    async isAvailable(): Promise<boolean> {
      return command !== null;
    },
    async read(ref: SecretRef) {
      if (ref.provider !== "infisical") {
        throw new SecretResolutionError(
          "infisical",
          `cannot read a "${ref.provider}" reference`,
        );
      }
      if (command === null) {
        throw new SecretResolutionError(
          "infisical",
          "the infisical CLI was not found on PATH",
        );
      }
      const args = ["secrets", "get", ref.key, "--plain", "--silent"];
      const environment = ref.environment ?? options.environment;
      const path = ref.path ?? options.path;
      const projectId = ref.projectId ?? options.projectId;
      if (environment !== undefined) {
        args.push("--env", environment);
      }
      if (path !== undefined) {
        args.push("--path", path);
      }
      if (projectId !== undefined) {
        args.push("--projectId", projectId);
      }
      const { stdout } = await run(command, args);
      const value = stdout.replace(/\r?\n$/, "");
      if (value === "") {
        throw new SecretResolutionError(
          "infisical",
          `secret "${ref.key}" was empty`,
        );
      }
      return toSecretValue(value);
    },
  };
}
