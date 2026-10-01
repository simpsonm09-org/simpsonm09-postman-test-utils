import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRunConfig, parseArgs } from "../src/config.js";
import { InvalidRunRequestError } from "../src/errors.js";

describe("parseArgs", () => {
  it("collects repeated folders and reporters", () => {
    const options = parseArgs([
      "--collection",
      "c.json",
      "--folder",
      "a",
      "-f",
      "b",
      "-r",
      "json",
      "--bail",
    ]);
    expect(options.collection).toBe("c.json");
    expect(options.folders).toEqual(["a", "b"]);
    expect(options.reporters).toEqual(["json"]);
    expect(options.bail).toBe(true);
  });

  it("accepts the documented run subcommand", () => {
    const options = parseArgs(["run", "--collection", "c.json"]);
    expect(options.collection).toBe("c.json");
  });

  it("parses the emit target", () => {
    const options = parseArgs(["run", "--collection", "c.json", "--emit", "out.json"]);
    expect(options.emit).toBe("out.json");
  });

  it("rejects a missing value", () => {
    expect(() => parseArgs(["--config"])).toThrow(InvalidRunRequestError);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"])).toThrow(InvalidRunRequestError);
  });
});

describe("loadRunConfig", () => {
  it("merges overrides over the config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ptu-config-"));
    const configPath = join(directory, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        collection: "./from-config.json",
        environment: "./env.json",
      }),
      "utf8",
    );

    const request = await loadRunConfig({
      ...parseArgs([]),
      configPath,
      collection: "./override.json",
    });
    expect(request.collection).toBe("./override.json");
    expect(request.environment).toBe("./env.json");
  });

  it("throws when no collection is provided", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ptu-config-"));
    const configPath = join(directory, "config.json");
    await writeFile(configPath, JSON.stringify({}), "utf8");
    await expect(
      loadRunConfig({ ...parseArgs([]), configPath }),
    ).rejects.toThrow(InvalidRunRequestError);
  });
});
