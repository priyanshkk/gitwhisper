/** Local provider and API key configuration. */

import { confirm, intro, outro, select, text } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import {
  type AppConfig,
  type ProviderName,
  configPath,
  defaultModel,
  loadConfig,
  maskedConfig,
  saveConfig,
} from "../../core/config.js";
import { CliError, abortIfCancelled, isInteractive, printJson } from "../shared.js";

const PROVIDER_OPTIONS: Array<{ value: ProviderName; label: string; hint: string }> = [
  { value: "gemini", label: "Gemini", hint: "Google AI Studio · GEMINI_API_KEY" },
  { value: "openai", label: "OpenAI", hint: "OPENAI_API_KEY" },
  { value: "anthropic", label: "Anthropic", hint: "ANTHROPIC_API_KEY" },
  { value: "ollama", label: "Ollama", hint: "100% local, no API key" },
  { value: "offline", label: "Offline heuristics", hint: "zero network, instant" },
];

function showConfig(config: AppConfig, json: boolean): void {
  const masked = maskedConfig(config);
  if (json) {
    printJson({ ...masked, path: configPath() });
    return;
  }
  process.stdout.write(`\n${pc.bold("GitWhisper configuration")}\n${pc.dim(configPath())}\n\n`);
  for (const [key, value] of Object.entries(masked)) {
    process.stdout.write(`  ${pc.cyan(key.padEnd(14))} ${String(value)}\n`);
  }
  process.stdout.write("\n");
}

function keyField(provider: ProviderName): "gemini" | "openai" | "anthropic" {
  if (provider === "gemini" || provider === "openai" || provider === "anthropic") return provider;
  throw new CliError(
    `Provider "${provider}" does not use an API key. Choose gemini, openai or anthropic.`,
  );
}

export function configCommand(): Command {
  return new Command("config")
    .description("manage provider, API keys and local Ollama settings")
    .option("--json", "emit masked configuration as JSON")
    .option("--provider <name>", "gemini, openai, anthropic, ollama or offline")
    .option("--model <name>", "model name for the selected provider")
    .option("--api-key <key>", "store an API key for the selected provider")
    .option("--ollama-host <url>", "Ollama server URL")
    .option("--ollama-model <name>", "local Ollama model name")
    .option("--offline", "force offline heuristics")
    .option("--online", "allow configured network providers")
    .option("--show", "print the current configuration")
    .option("--reset", "restore defaults and clear stored keys")
    .action(async (options) => {
      const hasMutation = Boolean(
        options.provider ||
          options.model ||
          options.apiKey ||
          options.ollamaHost ||
          options.ollamaModel ||
          options.offline ||
          options.online ||
          options.reset,
      );

      if (!hasMutation && !options.show && !options.json && isInteractive()) {
        intro(`${pc.bgCyan(pc.black(" GitWhisper "))} ${pc.bold("config")}`);
        const current = await loadConfig();
        const action = abortIfCancelled(
          await select({
            message: "What would you like to configure?",
            options: [
              { value: "provider", label: "AI provider", hint: `currently ${current.provider}` },
              { value: "key", label: "API key", hint: "stored in ~/.gitwhisper/config.json" },
              { value: "ollama", label: "Ollama server", hint: `currently ${current.ollamaHost}` },
              {
                value: "offline",
                label: "Toggle offline mode",
                hint: `currently ${current.offline ? "on" : "off"}`,
              },
              { value: "show", label: "Show configuration" },
              { value: "reset", label: "Reset everything", hint: "clears stored keys" },
            ],
          }),
        );

        if (action === "show") {
          showConfig(current, false);
          outro(pc.green("Configuration shown."));
          return;
        }
        if (action === "provider") {
          const provider = abortIfCancelled(
            await select({ message: "Choose a provider", options: PROVIDER_OPTIONS }),
          );
          const saved = await saveConfig({ provider, model: defaultModel(provider) });
          showConfig(saved, false);
          outro(pc.green(`Provider set to ${provider}.`));
          return;
        }
        if (action === "key") {
          const provider = abortIfCancelled(
            await select({
              message: "Which provider needs a key?",
              options: PROVIDER_OPTIONS.slice(0, 3),
            }),
          );
          const apiKey = abortIfCancelled(
            await text({
              message: `${provider} API key`,
              placeholder: "paste your key",
              validate: (value) => (String(value).trim() ? undefined : "Key is required."),
            }),
          );
          const apiKeys: AppConfig["apiKeys"] = { ...current.apiKeys };
          apiKeys[keyField(provider)] = String(apiKey).trim();
          const saved = await saveConfig({
            provider,
            model: defaultModel(provider),
            apiKeys,
            offline: false,
          });
          showConfig(saved, false);
          outro(pc.green("Key stored locally with 0600 permissions where supported."));
          return;
        }
        if (action === "ollama") {
          const host = abortIfCancelled(
            await text({
              message: "Ollama host",
              defaultValue: current.ollamaHost,
              placeholder: "http://127.0.0.1:11434",
            }),
          );
          const model = abortIfCancelled(
            await text({
              message: "Ollama model",
              defaultValue: current.ollamaModel,
              placeholder: "llama3.2",
            }),
          );
          const saved = await saveConfig({
            provider: "ollama",
            model: String(model),
            ollamaHost: String(host),
            ollamaModel: String(model),
            offline: false,
          });
          showConfig(saved, false);
          outro(pc.green("Ollama configured."));
          return;
        }
        if (action === "offline") {
          const saved = await saveConfig({ offline: !current.offline });
          showConfig(saved, false);
          outro(pc.green(`Offline mode ${saved.offline ? "enabled" : "disabled"}.`));
          return;
        }
        const confirmed = abortIfCancelled(
          await confirm({
            message: "Clear all stored keys and reset settings?",
            initialValue: false,
          }),
        );
        if (!confirmed) {
          outro(pc.yellow("Nothing changed."));
          return;
        }
      }

      if (options.reset) {
        const reset: AppConfig = {
          provider: "offline",
          model: "offline-heuristic",
          apiKeys: { gemini: "", openai: "", anthropic: "" },
          ollamaHost: "http://127.0.0.1:11434",
          ollamaModel: "llama3.2",
          offline: false,
        };
        await saveConfig(reset);
        outro(pc.green("Configuration reset."));
        showConfig(reset, Boolean(options.json));
        return;
      }

      let config = await loadConfig();
      const patch: Partial<AppConfig> = {};

      if (options.provider) {
        if (!["gemini", "openai", "anthropic", "ollama", "offline"].includes(options.provider)) {
          throw new CliError(`Unknown provider "${options.provider}".`);
        }
        patch.provider = options.provider as ProviderName;
      }
      if (options.model) patch.model = options.model;
      if (options.ollamaHost) patch.ollamaHost = options.ollamaHost;
      if (options.ollamaModel) patch.ollamaModel = options.ollamaModel;
      if (options.offline) patch.offline = true;
      if (options.online) patch.offline = false;

      if (options.apiKey) {
        const target = keyField(patch.provider ?? config.provider);
        const apiKeys: AppConfig["apiKeys"] = { ...config.apiKeys };
        apiKeys[target] = options.apiKey;
        patch.apiKeys = apiKeys;
        patch.provider = target;
        if (!options.model) patch.model = defaultModel(target);
        patch.offline = false;
      }

      if (hasMutation) config = await saveConfig(patch);
      showConfig(config, Boolean(options.json));
      if (!options.json) outro(pc.green("Configuration ready."));
    });
}
