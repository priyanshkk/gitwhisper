/** User configuration stored locally, never in the repository. */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderName = "gemini" | "openai" | "anthropic" | "ollama" | "offline";

export interface AppConfig {
  provider: ProviderName;
  model: string;
  apiKeys: {
    gemini: string;
    openai: string;
    anthropic: string;
  };
  ollamaHost: string;
  ollamaModel: string;
  offline: boolean;
}

const PROVIDERS = new Set<ProviderName>(["gemini", "openai", "anthropic", "ollama", "offline"]);

export function configDirectory(): string {
  return join(homedir(), ".gitwhisper");
}

export function configPath(): string {
  return join(configDirectory(), "config.json");
}

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function isProvider(value: unknown): value is ProviderName {
  return typeof value === "string" && PROVIDERS.has(value as ProviderName);
}

/** Environment variables win over the on-disk config so CI can override keys. */
export async function loadConfig(): Promise<AppConfig> {
  let stored: Partial<AppConfig> = {};
  try {
    stored = JSON.parse(await readFile(configPath(), "utf8")) as Partial<AppConfig>;
  } catch {
    stored = {};
  }

  const provider = env("GITWHISPER_PROVIDER", stored.provider ?? "offline");
  const offlineFlag = env("GITWHISPER_OFFLINE", String(stored.offline ?? false)) === "1";

  return {
    provider: isProvider(provider) ? provider : "offline",
    model: env(
      "GITWHISPER_MODEL",
      stored.model ?? defaultModel(isProvider(provider) ? provider : "offline"),
    ),
    apiKeys: {
      gemini: env("GEMINI_API_KEY", stored.apiKeys?.gemini ?? ""),
      openai: env("OPENAI_API_KEY", stored.apiKeys?.openai ?? ""),
      anthropic: env("ANTHROPIC_API_KEY", stored.apiKeys?.anthropic ?? ""),
    },
    ollamaHost: env("OLLAMA_HOST", stored.ollamaHost ?? "http://127.0.0.1:11434"),
    ollamaModel: env("OLLAMA_MODEL", stored.ollamaModel ?? "llama3.2"),
    offline: offlineFlag,
  };
}

export function defaultModel(provider: ProviderName): string {
  switch (provider) {
    case "gemini":
      return "gemini-2.0-flash";
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "ollama":
      return "llama3.2";
    default:
      return "offline-heuristic";
  }
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig();
  const next: AppConfig = {
    ...current,
    ...patch,
    apiKeys: { ...current.apiKeys, ...(patch.apiKeys ?? {}) },
  };
  await mkdir(configDirectory(), { recursive: true });
  await writeFile(configPath(), `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await chmod(configPath(), 0o600);
  } catch {
    // Windows does not support POSIX permissions; the file is still user-scoped.
  }
  return next;
}

/** Safe view of the config for CLI output and dashboards. */
export function maskedConfig(config: AppConfig): Record<string, string | boolean> {
  const mask = (value: string) =>
    value ? `${value.slice(0, 3)}••••${value.slice(-3)}` : "(not set)";
  return {
    provider: config.provider,
    model: config.model,
    gemini: mask(config.apiKeys.gemini),
    openai: mask(config.apiKeys.openai),
    anthropic: mask(config.apiKeys.anthropic),
    ollamaHost: config.ollamaHost,
    ollamaModel: config.ollamaModel,
    offline: config.offline,
  };
}
