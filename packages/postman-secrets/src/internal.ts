import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { SecretResolutionError } from "./errors.js";
import type { CommandRunner, SecretValue } from "./types.js";

const WINDOWS_EXTENSIONS = [".cmd", ".exe", ".bat"];

/** Find an executable on PATH, honouring Windows extensions. */
export function findExecutable(
  name: string,
  pathValue: string = process.env.PATH ?? "",
): string | null {
  const extensions = process.platform === "win32" ? WINDOWS_EXTENSIONS : [""];
  for (const directory of pathValue.split(delimiter)) {
    if (directory === "") {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not here, keep looking
      }
    }
  }
  return null;
}

/**
 * Run a command and capture its output. Rejects with a
 * {@link SecretResolutionError} on a non-zero exit. `shell` stays false so a
 * resolved secret never becomes part of a shell string.
 */
export const defaultCommandRunner: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new SecretResolutionError(command, error.message));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new SecretResolutionError(
          command,
          `exited with code ${code}. ${stderr.trim()}`,
        ),
      );
    });
  });

/** Cast a raw string into a {@link SecretValue} at the parse boundary. */
export function toSecretValue(value: string): SecretValue {
  return value as SecretValue;
}

/** The only unwrap. Call it where the value is consumed, never at rest. */
export function reveal(value: SecretValue): string {
  return value;
}
