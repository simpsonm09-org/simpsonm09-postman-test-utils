import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function packageSource(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      "@simpsonm09/postman-secrets": packageSource(
        "./packages/postman-secrets/src/index.ts",
      ),
      "@simpsonm09/postman-request-validation": packageSource(
        "./packages/postman-request-validation/src/index.ts",
      ),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["lcov"],
      reportsDirectory: "coverage",
      include: ["packages/*/src/**/*.ts", "src/**/*.ts"],
    },
  },
});
