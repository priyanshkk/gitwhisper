/** Shared CLI helpers: config resolution, diff loading and safe output. */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cancel, isCancel } from "@clack/prompts";
import type { Command } from "commander";
import pc from "picocolors";
import { type AppConfig, type ProviderName, defaultModel, loadConfig } from "../core/config.js";
import { DEMO_DIFF, readStagedDiff, readWorkingDiff, writeArtifact } from "../core/git.js";
import { countBySeverity } from "../core/scanner.js";
import type { SecretFinding, Severity } from "../core/types.js";

export interface GlobalOptions {
  demo?: boolean;
  json?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  output?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  offline?: boolean;
  online?: boolean;
  port?: string;
  open?: boolean;
  show?: boolean;
  reset?: boolean;
  apiKey?: string;
  ollamaHost?: string;
  ollamaModel?: string;
}

/** Options shared by every analysis command. */
export function addCommonOptions(command: Command): Command {
  return command
    .option("-d, --demo", "run with a realistic sample diff; no key, repo or network needed")
    .option("--json", "emit machine-readable JSON")
    .option("-C, --cwd <dir>", "run against another repository")
    .option("--provider <name>", "gemini, openai, anthropic, ollama or offline")
    .option("--offline", "force local heuristics even when a key is configured");
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

const PROVIDERS = new Set<ProviderName>(["gemini", "openai", "anthropic", "ollama", "offline"]);

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
}

export function abortIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled — nothing was changed.");
    process.exit(0);
  }
  return value as T;
}

/** Demo mode is deliberately offline so it never touches keys, files or the network. */
export async function resolveConfig(options: GlobalOptions): Promise<AppConfig> {
  const config = await loadConfig();
  if (options.demo) {
    return { ...config, provider: "offline", model: "offline-heuristic", offline: true };
  }

  if (options.provider) {
    if (!PROVIDERS.has(options.provider as ProviderName)) {
      throw new CliError(
        `Unknown provider "${options.provider}". Use gemini, openai, anthropic, ollama or offline.`,
      );
    }
    config.provider = options.provider as ProviderName;
    if (!options.model) config.model = defaultModel(config.provider);
  }
  if (options.model) config.model = options.model;
  if (options.offline !== undefined) config.offline = options.offline;
  if (options.online) config.offline = false;
  if (options.ollamaHost) config.ollamaHost = options.ollamaHost;
  if (options.ollamaModel) config.ollamaModel = options.ollamaModel;
  return config;
}

export async function loadDiff(
  options: GlobalOptions,
  mode: "staged" | "either" = "either",
): Promise<string> {
  if (options.demo) return DEMO_DIFF;
  if (mode === "staged") {
    const staged = await readStagedDiff(options.cwd);
    if (!staged.trim()) {
      throw new CliError(
        "No staged changes found. Run `git add <files>` first, or try `gw review --demo`.",
      );
    }
    return staged;
  }

  const staged = await readStagedDiff(options.cwd);
  if (staged.trim()) return staged;
  const working = await readWorkingDiff(options.cwd);
  if (working.trim()) return working;
  throw new CliError(
    "No changes detected. Stage a file or use `gw review --demo` to explore GitWhisper.",
  );
}

const SEVERITY_COLOR: Record<Severity, (text: string) => string> = {
  critical: (text) => pc.bgRed(pc.white(` ${text} `)),
  high: (text) => pc.red(text),
  medium: (text) => pc.yellow(text),
  low: (text) => pc.dim(text),
};

export function severityCounts(findings: SecretFinding[]): string {
  const counts = countBySeverity(findings);
  return (
    [
      counts.critical ? `${pc.red(`${counts.critical} critical`)}` : "",
      counts.high ? `${pc.yellow(`${counts.high} high`)}` : "",
      counts.medium ? `${counts.medium} medium` : "",
    ]
      .filter(Boolean)
      .join(" · ") || pc.green("clean")
  );
}

export function renderFindings(findings: SecretFinding[], limit = 8): string {
  if (!findings.length) return pc.green("  ✓  No leaked secrets found in added lines.");
  return findings
    .slice(0, limit)
    .map((finding) => {
      const badge = SEVERITY_COLOR[finding.severity](finding.severity.toUpperCase());
      return `  ${badge}  ${pc.bold(finding.rule)}  ${pc.dim(`${finding.file}:${finding.line}`)}\n         ${pc.dim(`masked: ${finding.redacted}`)}`;
    })
    .join("\n");
}

export function renderScore(score: number): string {
  const color = score >= 90 ? pc.green : score >= 70 ? pc.yellow : pc.red;
  const filled = Math.round(score / 10);
  return `${color("█".repeat(filled))}${pc.dim("░".repeat(10 - filled))}  ${color(`${score}/100`)}`;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Save a generated artifact. Demo runs stay file-free unless --output is explicit. */
export async function saveOutput(
  content: string,
  output: string | undefined,
  filename: string,
  demo = false,
): Promise<string> {
  if (output) {
    const target = resolve(output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return target;
  }
  if (demo) return "demo mode (not written)";
  return writeArtifact(filename, content);
}

export function handleFatal(error: unknown): void {
  if (error instanceof CliError) {
    process.stderr.write(`${pc.red("✖")} ${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`${pc.red("✖")} ${error.message}\n`);
    if (process.env.GITWHISPER_DEBUG) process.stderr.write(`${error.stack}\n`);
  } else {
    process.stderr.write(`${pc.red("✖")} ${String(error)}\n`);
  }
  process.exitCode = 1;
}
