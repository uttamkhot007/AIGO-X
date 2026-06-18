import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

export interface Config {
  url?: string;
  token?: string;
}

const CONFIG_DIR = join(homedir(), ".aigo-x");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Config;
  } catch {
    return {};
  }
}

export function setConfig(update: Partial<Config>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const current = getConfig();
  const next = { ...current, ...update };
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

export function configPath(): string {
  return CONFIG_FILE;
}

export function requireConfig(): Required<Config> {
  const config = getConfig();
  if (!config.url || !config.token) {
    console.error(
      "\x1b[31m✖\x1b[0m  Not configured. Run: aigo-x login --url <URL> --token <TOKEN>"
    );
    process.exit(1);
  }
  return config as Required<Config>;
}
