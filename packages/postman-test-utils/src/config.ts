import { readFile } from "node:fs/promises";
import { InvalidRunRequestError } from "./errors.js";
import type { RunRequest } from "./types.js";

export const DEFAULT_CONFIG_FILE = "postman-test-utils.config.json";

export interface CliOptions {
  readonly configPath?: string;
  readonly collection?: string;
  readonly environment?: string;
  readonly globals?: string;
  readonly folders: readonly string[];
  readonly reporters: readonly string[];
  readonly bail: boolean;
  readonly emit?: string;
  readonly help: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const args = argv[0] === "run" ? argv.slice(1) : argv;
  const options = {
    folders: [] as string[],
    reporters: [] as string[],
    bail: false,
    help: false,
  } as {
    configPath?: string;
    collection?: string;
    environment?: string;
    globals?: string;
    folders: string[];
    reporters: string[];
    bail: boolean;
    emit?: string;
    help: boolean;
  };

  const readValue = (index: number, flag: string): string => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new InvalidRunRequestError(flag, "expected a value");
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--config":
      case "-c":
        options.configPath = readValue(index, arg);
        index += 1;
        break;
      case "--collection":
        options.collection = readValue(index, arg);
        index += 1;
        break;
      case "--environment":
      case "-e":
        options.environment = readValue(index, arg);
        index += 1;
        break;
      case "--globals":
      case "-g":
        options.globals = readValue(index, arg);
        index += 1;
        break;
      case "--folder":
      case "-f":
        options.folders.push(readValue(index, arg));
        index += 1;
        break;
      case "--reporter":
      case "-r":
        options.reporters.push(readValue(index, arg));
        index += 1;
        break;
      case "--bail":
        options.bail = true;
        break;
      case "--emit":
        options.emit = readValue(index, arg);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new InvalidRunRequestError(
          "args",
          `unknown argument "${String(arg)}"`,
        );
    }
  }

  return options;
}

async function readConfig(path: string): Promise<Partial<RunRequest>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new InvalidRunRequestError(
      "config",
      `could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(raw) as Partial<RunRequest>;
  } catch {
    throw new InvalidRunRequestError("config", `${path} is not valid JSON`);
  }
}

/** Merge the config file with command line overrides into one request. */
export async function loadRunConfig(options: CliOptions): Promise<RunRequest> {
  const config =
    options.configPath !== undefined
      ? await readConfig(options.configPath)
      : await readConfig(DEFAULT_CONFIG_FILE).catch(
          (): Partial<RunRequest> => ({}),
        );

  const collection = options.collection ?? config.collection;
  if (collection === undefined) {
    throw new InvalidRunRequestError(
      "collection",
      `provide a collection in ${DEFAULT_CONFIG_FILE} or pass --collection`,
    );
  }

  return {
    ...config,
    collection,
    ...(options.environment === undefined
      ? {}
      : { environment: options.environment }),
    ...(options.globals === undefined ? {} : { globals: options.globals }),
    ...(options.folders.length === 0 ? {} : { folder: options.folders }),
    ...(options.reporters.length === 0
      ? {}
      : { reporters: options.reporters }),
    ...(options.bail ? { bail: true } : {}),
  };
}

export function helpText(): string {
  return [
    "Usage: postman-test-utils run [options]",
    "",
    "Runs a Postman v2.1 collection offline through newman.",
    "",
    "Options:",
    `  --config <path>        Config file (default: ${DEFAULT_CONFIG_FILE})`,
    "  --collection <path>    Collection file (overrides the config)",
    "  --environment, -e <p>  Environment file (overrides the config)",
    "  --globals, -g <path>   Globals file (overrides the config)",
    "  --folder, -f <name>    Run one folder; repeat for several",
    "  --reporter, -r <name>  Reporter to load; repeat for several",
    "  --bail                 Stop the run on the first failure",
    "  --emit <path>          Write the collection with the validation prelude baked in, then exit",
    "  --help, -h             Show this help",
  ].join("\n");
}
