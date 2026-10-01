export class SecretResolutionError extends Error {
  readonly provider: string;

  constructor(provider: string, detail: string) {
    super(`Secret provider "${provider}" failed: ${detail}`);
    this.name = "SecretResolutionError";
    this.provider = provider;
  }
}
