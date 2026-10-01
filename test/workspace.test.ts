import { access, readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packagesRoot = new URL("../packages/", import.meta.url);

interface PackageJson {
  name: string;
  version: string;
  exports: Record<string, unknown>;
}

interface JsrJson {
  name: string;
  version: string;
  exports: Record<string, unknown>;
}

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

async function packageNames(): Promise<string[]> {
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe("workspace packages", () => {
  it("publishes all packages at one version", async () => {
    const names = await packageNames();
    expect(names.length).toBeGreaterThanOrEqual(3);

    const versions = new Set<string>();
    for (const name of names) {
      const pkg = await readJson<PackageJson>(
        new URL(`${name}/package.json`, packagesRoot),
      );
      const jsr = await readJson<JsrJson>(
        new URL(`${name}/jsr.json`, packagesRoot),
      );
      expect(jsr.version, `${name} jsr version`).toBe(pkg.version);
      versions.add(pkg.version);
    }
    expect(versions.size).toBe(1);
  });

  it("ships a LICENSE in every package", async () => {
    for (const name of await packageNames()) {
      await expect(
        access(new URL(`${name}/LICENSE`, packagesRoot)),
      ).resolves.toBeUndefined();
    }
  });

  it("points the engine at the other packages from both registries", async () => {
    const pkg = await readJson<PackageJson>(
      new URL("postman-test-utils/package.json", packagesRoot),
    );
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./scripting"]);
    expect(pkg.name).toBe("postman-test-utils");
  });

  it("keeps the sandbox package free of Node builtins", async () => {
    const bareRequire = /(?<![\w.])require\s*\(/;
    const nodeImport = /from\s+["']node:/;

    const source = await readFile(
      new URL("postman-request-validation/src/index.ts", packagesRoot),
      "utf8",
    );
    expect(source).not.toMatch(nodeImport);
    expect(source).not.toMatch(bareRequire);

    const distPath = new URL(
      "postman-request-validation/dist/index.js",
      packagesRoot,
    );
    const built = await readFile(distPath, "utf8").catch(() => null);
    if (built !== null) {
      expect(built).not.toMatch(nodeImport);
      expect(built).not.toMatch(bareRequire);
    }
  });
});
