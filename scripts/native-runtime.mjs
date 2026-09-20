import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectHashAsync, SourceSkips } from "@expo/fingerprint";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(projectRoot, "native-runtime-baseline.json");
const appConfigPath = resolve(projectRoot, "app.json");
const packagePath = resolve(projectRoot, "package.json");
const command = process.argv[2] ?? "validate";
const initialize = process.argv.includes("--initialize");
const options = {
  platforms: ["android", "ios"],
  sourceSkips: SourceSkips.ExpoConfigVersions | SourceSkips.PackageJsonScriptsAll,
  silent: true,
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const appConfig = await readJson(appConfigPath);
const packageJson = await readJson(packagePath);
const version = appConfig.expo.version;

if (appConfig.expo.runtimeVersion?.policy !== "appVersion") {
  console.error('Siply release validation expects runtimeVersion.policy = "appVersion".');
  process.exit(1);
}
if (packageJson.version !== version) {
  console.error(`Version mismatch: app.json is ${version}, package.json is ${packageJson.version}.`);
  process.exit(1);
}
const hash = await createProjectHashAsync(projectRoot, options);

if (command === "accept") {
  let previous = null;
  try {
    previous = await readJson(baselinePath);
  } catch {
    // First baseline is allowed only through the explicit initialization flag.
  }

  if (!initialize && previous && previous.hash !== hash && previous.appVersion === version) {
    console.error(
      `Native inputs changed while app version remains ${version}. Bump expo.version first, then run npm run accept:native-runtime.`
    );
    process.exit(1);
  }

  if (!initialize && !previous) {
    console.error("No native-runtime baseline exists. Use --initialize only when bootstrapping the guard.");
    process.exit(1);
  }

  await writeFile(
    baselinePath,
    `${JSON.stringify({ schemaVersion: 1, appVersion: version, hash }, null, 2)}\n`,
    "utf8"
  );
  console.log(`Accepted native runtime ${version} (${hash.slice(0, 12)}).`);
  process.exit(0);
}

let baseline;
try {
  baseline = await readJson(baselinePath);
} catch {
  console.error("Native-runtime baseline is missing. Run npm run accept:native-runtime after setting the app version.");
  process.exit(1);
}

if (baseline.appVersion !== version) {
  console.error(
    `app.json is ${version}, but the accepted native runtime is ${baseline.appVersion}. Run npm run accept:native-runtime after reviewing native changes.`
  );
  process.exit(1);
}

if (baseline.hash !== hash) {
  console.error(
    `Native changes were detected without an app-version bump (${version}). Bump expo.version, then run npm run accept:native-runtime.`
  );
  process.exit(1);
}

console.log(`Native runtime ${version} is compatible (${hash.slice(0, 12)}).`);
