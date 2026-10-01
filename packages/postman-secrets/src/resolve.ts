import { envProvider } from "./env.js";
import { SecretResolutionError } from "./errors.js";
import { infisicalProvider } from "./infisical.js";
import { vaultProvider } from "./vault.js";
import type {
  ResolvedBinding,
  ResolvedSecrets,
  SecretBinding,
  SecretProvider,
  SecretValue,
} from "./types.js";

export interface ResolveOptions {
  readonly providers?: readonly SecretProvider[];
}

/** The provider set used when the caller does not supply one. */
export function defaultProviders(): readonly SecretProvider[] {
  return [envProvider(), vaultProvider(), infisicalProvider()];
}

/**
 * Resolve every binding through its provider. Providers are independent, so a
 * later provider never overwrites an earlier one.
 */
export async function resolveSecrets(
  bindings: readonly SecretBinding[],
  options: ResolveOptions = {},
): Promise<ResolvedSecrets> {
  const providers = options.providers ?? defaultProviders();
  const byId = new Map<string, SecretProvider>(
    providers.map((provider) => [provider.id, provider]),
  );
  const values = new Map<string, SecretValue>();
  const resolved: ResolvedBinding[] = [];

  for (const binding of bindings) {
    const provider = byId.get(binding.secret.provider);
    if (provider === undefined) {
      throw new SecretResolutionError(
        binding.secret.provider,
        "no provider is registered for this kind",
      );
    }
    const value = await provider.read(binding.secret);
    values.set(binding.variable, value);
    resolved.push({
      variable: binding.variable,
      value,
      scope: binding.scope ?? "environment",
    });
  }

  return { values, bindings: resolved };
}

/** Resolve a bare list of environment variable names, for convenience. */
export async function resolveEnvironment(
  names: readonly string[],
  options: ProviderOptionsLike = {},
): Promise<Map<string, SecretValue>> {
  const bindings: SecretBinding[] = names.map((name) => ({
    variable: name,
    secret: { provider: "env", name },
  }));
  const resolved = await resolveSecrets(bindings, options);
  return new Map(resolved.values);
}

interface ProviderOptionsLike {
  readonly providers?: readonly SecretProvider[];
}
