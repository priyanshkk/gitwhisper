/** Unified LLM interface with native fetch. No AI SDK dependency. */

import type { AppConfig, ProviderName } from "../config.js";

export interface LlmResponse {
  text: string;
  engine: string;
}

export interface LlmProvider {
  name: ProviderName;
  model: string;
  configured: boolean;
  generate(system: string, user: string): Promise<LlmResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 20_000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok)
      throw new ProviderError(`HTTP ${response.status}: ${raw.slice(0, 240)}`, "llm");
    return raw;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderError(message, "llm");
  } finally {
    clearTimeout(timer);
  }
}

function provider(
  config: AppConfig,
  name: ProviderName,
  model: string,
  configured: boolean,
  generate: LlmProvider["generate"],
): LlmProvider {
  return { name, model, configured, generate };
}

/** Choose a provider from config; missing keys fall back to offline heuristics. */
export function createProvider(config: AppConfig): LlmProvider {
  if (config.offline) return offlineProvider(config);

  switch (config.provider) {
    case "gemini": {
      if (!config.apiKeys.gemini || config.apiKeys.gemini === "your_key_here")
        return offlineProvider(config);
      const model = config.model || "gemini-2.0-flash";
      return provider(config, "gemini", model, true, async (system, user) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKeys.gemini)}`;
        const raw = await postJson(
          url,
          {},
          {
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              maxOutputTokens: 2048,
            },
          },
        );
        const payload = JSON.parse(raw) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          error?: { message?: string };
        };
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text)
          throw new ProviderError(payload.error?.message ?? "Empty Gemini response", "gemini");
        return { text, engine: `gemini:${model}` };
      });
    }
    case "openai": {
      if (!config.apiKeys.openai) return offlineProvider(config);
      const model = config.model || "gpt-4o-mini";
      return provider(config, "openai", model, true, async (system, user) => {
        const raw = await postJson(
          "https://api.openai.com/v1/chat/completions",
          { authorization: `Bearer ${config.apiKeys.openai}` },
          {
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          },
        );
        const payload = JSON.parse(raw) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };
        const text = payload.choices?.[0]?.message?.content;
        if (!text)
          throw new ProviderError(payload.error?.message ?? "Empty OpenAI response", "openai");
        return { text, engine: `openai:${model}` };
      });
    }
    case "anthropic": {
      if (!config.apiKeys.anthropic) return offlineProvider(config);
      const model = config.model || "claude-3-5-haiku-latest";
      return provider(config, "anthropic", model, true, async (system, user) => {
        const raw = await postJson(
          "https://api.anthropic.com/v1/messages",
          {
            "x-api-key": config.apiKeys.anthropic,
            "anthropic-version": "2023-06-01",
          },
          {
            model,
            max_tokens: 2048,
            temperature: 0,
            system,
            messages: [{ role: "user", content: user }],
          },
        );
        const payload = JSON.parse(raw) as {
          content?: Array<{ text?: string }>;
          error?: { message?: string };
        };
        const text = payload.content?.find((part) => part.text)?.text;
        if (!text)
          throw new ProviderError(
            payload.error?.message ?? "Empty Anthropic response",
            "anthropic",
          );
        return { text, engine: `anthropic:${model}` };
      });
    }
    case "ollama": {
      const model = config.ollamaModel || config.model || "llama3.2";
      return provider(config, "ollama", model, true, async (system, user) => {
        const host = config.ollamaHost.replace(/\/$/, "");
        const raw = await postJson(
          `${host}/api/generate`,
          {},
          {
            model,
            prompt: `${system}\n\n${user}`,
            format: "json",
            stream: false,
          },
        );
        const payload = JSON.parse(raw) as { response?: string; error?: string };
        if (!payload.response)
          throw new ProviderError(payload.error ?? "Empty Ollama response", "ollama");
        return { text: payload.response, engine: `ollama:${model}` };
      });
    }
    default:
      return offlineProvider(config);
  }
}

function offlineProvider(config: AppConfig): LlmProvider {
  return provider(config, "offline", "offline-heuristic", true, async (system, _user) => ({
    text: JSON.stringify({
      summary: `${system.includes("reviewer") ? "Local heuristic review" : "Local heuristic analysis"} completed offline.`,
      suggestions: [],
    }),
    engine: "offline-heuristic",
  }));
}

/** Strip optional Markdown fences and parse a JSON object from a model reply. */
export function parseJsonObject<T>(text: string): T {
  let value = text.trim();
  if (value.startsWith("```"))
    value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new ProviderError("Model did not return a JSON object", "parser");
  return JSON.parse(value.slice(start, end + 1)) as T;
}

/** Convenience wrapper used by every command. */
export async function generateStructured<T>(
  llm: LlmProvider,
  system: string,
  user: string,
): Promise<{ data: T; engine: string }> {
  const response = await llm.generate(system, user);
  return { data: parseJsonObject<T>(response.text), engine: response.engine };
}
