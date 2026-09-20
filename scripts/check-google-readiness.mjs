import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const EXEC_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/;

export function inspectConfiguration(config) {
  const issues = [];
  const pending = [];
  for (const [key, label] of [
    ["publicFeedUrl", "Public Feed"],
    ["recipeImportUrl", "Recipe Import"]
  ]) {
    const value = String(config?.[key] || "").trim();
    if (!value) pending.push(`${label} /exec URL`);
    else if (!EXEC_URL.test(value)) issues.push(`${label} must be a production script.google.com /exec URL.`);
  }
  return { connected: !pending.length && !issues.length, pending, issues };
}

async function loadConfig() {
  const source = await readFile(new URL("site/config.js", root), "utf8");
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context, { filename: "site/config.js" });
  return context.window.GCSD_CONFIG || {};
}

async function main() {
  const result = inspectConfiguration(await loadConfig());
  if (result.issues.length) {
    console.error("Google connection has invalid values:");
    result.issues.forEach(issue => console.error(`- ${issue}`));
    process.exitCode = 1;
    return;
  }
  if (result.pending.length) {
    console.log("Local and GitHub pieces are ready. Google connection is intentionally pending:");
    result.pending.forEach(item => console.log(`- ${item}`));
    console.log("Complete docs/weekend-google-setup.md when signed into the GCSD account.");
    if (process.argv.includes("--require-connected")) process.exitCode = 2;
    return;
  }
  console.log("All public student-site Apps Script /exec URLs are configured.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  await main();
}
