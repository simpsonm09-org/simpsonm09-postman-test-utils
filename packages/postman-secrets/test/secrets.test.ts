import { describe, expect, it } from "vitest";
import {
  SecretResolutionError,
  envProvider,
  infisicalProvider,
  parseDotenvExport,
  parseVaultKvJson,
  resolveSecrets,
  reveal,
  vaultProvider,
  type CommandRunner,
} from "../src/index.js";

interface Call {
  command: string;
  args: string[];
}

function fakeRunner(
  stdout: string,
  calls: Call[] = [],
  stderr = "",
): CommandRunner {
  return async (command, args) => {
    calls.push({ command, args: [...args] });
    return { stdout, stderr };
  };
}

describe("parseVaultKvJson", () => {
  it("reads KV v2 pairs from data.data", () => {
    expect(parseVaultKvJson('{"data":{"data":{"token":"abc"}}}')).toEqual({
      token: "abc",
    });
  });

  it("reads KV v1 pairs from data", () => {
    expect(parseVaultKvJson('{"data":{"token":"abc"}}')).toEqual({
      token: "abc",
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseVaultKvJson("not json")).toThrow(SecretResolutionError);
  });
});

describe("parseDotenvExport", () => {
  it("parses export lines, quotes, and comments", () => {
    const parsed = parseDotenvExport(
      ['# comment', 'export TOKEN="abc"', "PLAIN=value", "", "EMPTY="].join(
        "\n",
      ),
    );
    expect(parsed).toEqual({ TOKEN: "abc", PLAIN: "value", EMPTY: "" });
  });
});

describe("envProvider", () => {
  it("reads from the supplied environment", async () => {
    const provider = envProvider({ env: { TOKEN: "abc" } });
    expect(reveal(await provider.read({ provider: "env", name: "TOKEN" }))).toBe(
      "abc",
    );
  });

  it("throws when the variable is missing", async () => {
    const provider = envProvider({ env: {} });
    await expect(
      provider.read({ provider: "env", name: "TOKEN" }),
    ).rejects.toThrow(SecretResolutionError);
  });
});

describe("vaultProvider", () => {
  it("reads a field through the vault CLI", async () => {
    const calls: Call[] = [];
    const provider = vaultProvider({
      command: fakeRunner('{"data":{"data":{"token":"vault-token"}}}', calls),
    });
    const value = await provider.read({
      provider: "vault",
      path: "secret/data/ci",
      field: "token",
    });
    expect(reveal(value)).toBe("vault-token");
    expect(calls[0].command).toBe("vault");
    expect(calls[0].args).toEqual([
      "kv",
      "get",
      "-format=json",
      "secret/data/ci",
    ]);
  });

  it("throws when the field is missing", async () => {
    const provider = vaultProvider({
      command: fakeRunner('{"data":{"data":{}}}'),
    });
    await expect(
      provider.read({ provider: "vault", path: "secret/data/ci", field: "token" }),
    ).rejects.toThrow(SecretResolutionError);
  });
});

describe("infisicalProvider", () => {
  it("reads a secret and trims the trailing newline", async () => {
    const calls: Call[] = [];
    const provider = infisicalProvider({
      command: fakeRunner("infisical-token\n", calls),
      environment: "dev",
    });
    const value = await provider.read({
      provider: "infisical",
      key: "TOKEN",
    });
    expect(reveal(value)).toBe("infisical-token");
    expect(calls[0].args).toEqual([
      "secrets",
      "get",
      "TOKEN",
      "--plain",
      "--silent",
      "--env",
      "dev",
    ]);
  });
});

describe("resolveSecrets", () => {
  it("maps bindings to values and scopes", async () => {
    const resolved = await resolveSecrets(
      [
        { variable: "a", secret: { provider: "env", name: "A" } },
        {
          variable: "b",
          scope: "globals",
          secret: { provider: "env", name: "B" },
        },
      ],
      { providers: [envProvider({ env: { A: "1", B: "2" } })] },
    );
    expect(reveal(resolved.values.get("a")!)).toBe("1");
    expect(resolved.bindings).toEqual([
      expect.objectContaining({ variable: "a", scope: "environment" }),
      expect.objectContaining({ variable: "b", scope: "globals" }),
    ]);
  });

  it("throws when no provider is registered", async () => {
    await expect(
      resolveSecrets([{ variable: "a", secret: { provider: "env", name: "A" } }], {
        providers: [],
      }),
    ).rejects.toThrow(SecretResolutionError);
  });
});
