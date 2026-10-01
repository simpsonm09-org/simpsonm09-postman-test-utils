/**
 * A resolved secret. The brand keeps a secret from flowing into a plain
 * `string` field without an explicit {@link reveal} at the boundary that
 * consumes it.
 */
export type SecretValue = string & { readonly __brand: "SecretValue" };

export type SecretRef =
  | { readonly provider: "env"; readonly name: string }
  | { readonly provider: "vault"; readonly path: string; readonly field: string }
  | {
      readonly provider: "infisical";
      readonly key: string;
      readonly environment?: string;
      readonly path?: string;
      readonly projectId?: string;
    };

export type SecretScope = "environment" | "globals";

export interface SecretBinding {
  readonly variable: string;
  readonly secret: SecretRef;
  readonly scope?: SecretScope;
}

export interface ResolvedBinding {
  readonly variable: string;
  readonly value: SecretValue;
  readonly scope: SecretScope;
}

export interface ResolvedSecrets {
  readonly values: ReadonlyMap<string, SecretValue>;
  readonly bindings: readonly ResolvedBinding[];
}

export interface SecretProvider {
  readonly id: SecretRef["provider"];
  isAvailable(): Promise<boolean>;
  read(ref: SecretRef): Promise<SecretValue>;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<CommandResult>;

export interface ProviderOptions {
  readonly command?: CommandRunner;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly path?: string;
}
