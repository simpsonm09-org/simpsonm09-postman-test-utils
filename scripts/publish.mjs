// Publish the three workspace packages in dependency order. Dry run by
// default. Pass --publish to actually publish. Run `npm run publish:dry-run`.
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2);
const actuallyPublish = args.includes("--publish");
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : "latest";

if (tagIndex >= 0 && tag === undefined) {
  console.error("--tag needs a value");
  process.exit(1);
}

if (!/^[a-z0-9._-]+$/i.test(tag)) {
  console.error(`--tag "${tag}" is not a valid dist-tag`);
  process.exit(1);
}

const packages = [
  "@simpsonm09/postman-secrets",
  "@simpsonm09/postman-request-validation",
  "postman-test-utils",
];

for (const name of packages) {
  const command = ["publish", "--workspace", name, "--tag", tag];
  if (!actuallyPublish) {
    command.push("--dry-run");
  }
  console.log(`npm ${command.join(" ")}`);
  execFileSync(npm, command, {
    cwd: repo,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

console.log(
  actuallyPublish
    ? `published ${packages.length} packages with tag ${tag}`
    : "dry run only. Pass --publish to publish.",
);
