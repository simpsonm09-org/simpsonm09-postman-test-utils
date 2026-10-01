// Minimal shape for the optional `newman` peer dependency. newman ships no
// types of its own and is not a hard dependency, so the package declares what
// it uses instead of depending on `@types/newman`.

declare module "newman" {
  export interface NewmanRunOptions {
    collection: unknown;
    environment?: unknown;
    globals?: unknown;
    iterationData?: unknown;
    folder?: unknown;
    reporters?: unknown;
    timeoutRequest?: number;
    bail?: boolean;
  }

  export interface NewmanInstance {
    run(
      options: NewmanRunOptions,
      callback: (error: Error | null, summary: unknown) => void,
    ): unknown;
  }

  const newman: NewmanInstance;
  export default newman;
}
