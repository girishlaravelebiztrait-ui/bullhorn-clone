// Load .env into process.env for standalone scripts (Next does this for the
// app automatically, but tsx scripts run outside Next). Uses Node 20.6+/22's
// built-in env file loader. Prefers .env.local, then .env.
import fs from "fs";

function tryLoad(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const loader = (process as unknown as { loadEnvFile?: (p: string) => void })
    .loadEnvFile;
  if (typeof loader === "function") {
    loader.call(process, file);
    return true;
  }
  // Minimal fallback parser for older runtimes.
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = (m[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

tryLoad(".env.local");
tryLoad(".env");
