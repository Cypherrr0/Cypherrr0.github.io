import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const configuredWiki = process.env.COREPEDIA_WIKI_PATH?.trim();
const wikiRoot = configuredWiki
  ? path.resolve(configuredWiki)
  : path.resolve(projectRoot, "..", "corepedia", "wikis");
const registryPath = path.resolve(
  wikiRoot,
  "..",
  ".trae",
  "skills",
  "corepedia-h5-artifact",
  "references",
  "runtime-registry.json",
);
const outputRoot = path.join(projectRoot, "public", "artifact-runtimes");

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function fail(message) {
  throw new Error(`Artifact runtime sync failed: ${message}`);
}

if (!fs.existsSync(registryPath)) {
  fail(`registry not found: ${registryPath}`);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
if (
  registry?.schemaVersion !== 1 ||
  !Array.isArray(registry.runtimes)
) {
  fail("unsupported runtime registry schema");
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const runtime of registry.runtimes) {
  const expectedFields = [
    "allowedLieflatPalettes",
    "allowedLieflatTemplates",
    "bytes",
    "global",
    "license",
    "maxBytes",
    "name",
    "packageFile",
    "profile",
    "publicPath",
    "sha256",
    "version",
  ];
  if (
    !runtime ||
    typeof runtime !== "object" ||
    Object.keys(runtime).sort().join(",") !== expectedFields.sort().join(",")
  ) {
    fail("runtime entry fields are invalid");
  }
  if (runtime.name !== "echarts" || runtime.profile !== "simple") {
    fail(`unsupported runtime identity: ${runtime.name}/${runtime.profile}`);
  }
  const packageJsonPath = path.join(
    projectRoot,
    "node_modules",
    runtime.name,
    "package.json",
  );
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (
    packageJson.version !== runtime.version ||
    packageJson.license !== runtime.license
  ) {
    fail(`package metadata mismatch for ${runtime.name}`);
  }

  const sourcePath = path.resolve(packageRoot, runtime.packageFile);
  const relativeSource = path.relative(packageRoot, sourcePath);
  if (
    relativeSource.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeSource) ||
    !fs.statSync(sourcePath).isFile()
  ) {
    fail(`runtime package file escapes package root: ${runtime.packageFile}`);
  }
  const source = fs.readFileSync(sourcePath);
  if (source.length > runtime.maxBytes) {
    fail(`${runtime.name} exceeds ${runtime.maxBytes} bytes`);
  }
  if (source.length !== runtime.bytes) {
    fail(`${runtime.name} byte length mismatch`);
  }
  if (sha256(source) !== runtime.sha256) {
    fail(`${runtime.name} SHA-256 mismatch`);
  }
  if (source.toString("utf8").toLowerCase().includes("</script")) {
    fail(`${runtime.name} contains an unsafe closing script sequence`);
  }

  const publicPrefix = "/artifact-runtimes/";
  if (
    typeof runtime.publicPath !== "string" ||
    !runtime.publicPath.startsWith(publicPrefix) ||
    !/^\/artifact-runtimes\/[a-z0-9.-]+\.js$/.test(runtime.publicPath)
  ) {
    fail(`invalid publicPath: ${runtime.publicPath}`);
  }
  const outputPath = path.join(
    outputRoot,
    runtime.publicPath.slice(publicPrefix.length),
  );
  fs.writeFileSync(outputPath, source);
  fs.copyFileSync(
    path.join(packageRoot, "LICENSE"),
    path.join(outputRoot, `${runtime.name}-${runtime.version}-LICENSE.txt`),
  );
  fs.copyFileSync(
    path.join(packageRoot, "NOTICE"),
    path.join(outputRoot, `${runtime.name}-${runtime.version}-NOTICE.txt`),
  );
  console.log(
    `Synced ${runtime.name}@${runtime.version}/${runtime.profile} `
      + `(${source.length} bytes, sha256:${runtime.sha256})`,
  );
}
