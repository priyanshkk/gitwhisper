/** Offline heuristics plus optional LLM enrichment for commits, reviews and PRs. */

import type { AppConfig } from "./config.js";
import { addedLines } from "./git.js";
import {
  COMMIT_SYSTEM,
  PR_SYSTEM,
  REVIEW_SYSTEM,
  commitUserPrompt,
  prUserPrompt,
  reviewUserPrompt,
} from "./llm/prompts.js";
import { createProvider, generateStructured } from "./llm/provider.js";
import type {
  CommitSuggestion,
  CommitType,
  ParsedDiff,
  PrDraft,
  ReviewResult,
  SecretFinding,
} from "./types.js";

const VALID_TYPES: CommitType[] = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "test",
  "chore",
  "perf",
  "style",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length ? items.slice(0, 6) : fallback;
}

function imperative(value: string): string {
  const replacements: Record<string, string> = {
    added: "add",
    adds: "add",
    fixed: "fix",
    fixes: "fix",
    updated: "update",
    updates: "update",
    created: "create",
    creates: "create",
    implemented: "implement",
    implements: "implement",
    removed: "remove",
    removes: "remove",
    refactored: "refactor",
    refactors: "refactor",
  };
  return value.replace(
    /^([A-Za-z]+)/,
    (word) => replacements[word.toLowerCase()] ?? word.toLowerCase(),
  );
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

function cleanSubject(value: string): string {
  const cleaned = value
    .replace(/^[-*+•\s]+/, "")
    .replace(/[`*_]/g, "")
    .replace(/[.!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return imperative(cleaned).slice(0, 72).replace(/\s+$/, "");
}

function scopeFor(parsed: ParsedDiff): string {
  const path = parsed.files[0]?.path ?? "repo";
  const parts = path.split("/").filter(Boolean);
  const file = parts.at(-1) ?? "repo";
  const stem = file.replace(/\.[^.]+$/, "");
  if (stem === "index" && parts.length > 1) return parts.at(-2) ?? "repo";
  return stem.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "repo";
}

function inferType(parsed: ParsedDiff): CommitType {
  const paths = parsed.files.map((file) => file.path);
  const added = addedLines(parsed)
    .map((line) => line.content)
    .join("\n");
  const everyPathMatches = (pattern: RegExp) =>
    paths.length > 0 && paths.every((path) => pattern.test(path));

  if (/\b(fix|bug|error|handle|catch|validate|guard|prevent)\b/i.test(added)) return "fix";
  if (/\b(refactor|rename|extract|cleanup|simplify)\b/i.test(added)) return "refactor";
  if (/\b(perf|cache|optimiz|memo)\b/i.test(added)) return "perf";
  if (everyPathMatches(/\.(test|spec)\.[^.]+$|tests?\//i)) return "test";
  if (everyPathMatches(/(^|\/)(readme|docs?|changelog)|\.md$/i)) return "docs";
  if (everyPathMatches(/(^|\/)(package|lock|docker|config|\.github)/i)) return "chore";
  if (
    /\b(format|style|spacing|lint|prettier)\b/i.test(added) &&
    paths.every((path) => /\.(css|scss)$/.test(path))
  )
    return "style";
  return "feat";
}

function pickSubject(parsed: ParsedDiff, type: CommitType): string {
  const lines = addedLines(parsed)
    .map((entry) => entry.content.trim())
    .filter(
      (line) =>
        line.length > 8 &&
        !line.startsWith("import ") &&
        !line.startsWith("//") &&
        !line.startsWith("/*") &&
        !line.startsWith("*") &&
        !/^[{}\])]+$/.test(line),
    );

  const sentence = lines.find(
    (line) => line.length <= 110 && /[a-z]/.test(line) && /[a-z]\.$/.test(line),
  );
  if (sentence) return cleanSubject(sentence);

  const namedFunction = lines.find((line) => /\bfunction\s+[A-Za-z0-9_]+/.test(line));
  const functionName = namedFunction
    ? /function\s+([A-Za-z0-9_]+)/.exec(namedFunction)?.[1]
    : undefined;
  if (functionName) return `${type === "feat" ? "add" : type} ${humanizeIdentifier(functionName)}`;

  const fileStems = parsed.files
    .map(
      (file) =>
        file.path
          .split("/")
          .at(-1)
          ?.replace(/\.[^.]+$/, "") ?? "",
    )
    .filter(Boolean)
    .map(humanizeIdentifier);
  const unique = [...new Set(fileStems)].slice(0, 2).join(" and ");
  return unique ? `${type === "feat" ? "add" : type} ${unique}` : `${type} repository changes`;
}

function formatCommitMessage(
  suggestion: Pick<CommitSuggestion, "type" | "scope" | "subject" | "body">,
): string {
  const header = `${suggestion.type}${suggestion.scope ? `(${suggestion.scope})` : ""}: ${suggestion.subject}`;
  return suggestion.body.length
    ? `${header}\n\n${suggestion.body.map((line) => `- ${line}`).join("\n")}`
    : header;
}

/** Deterministic local commit suggestion. Works with zero network access. */
export function heuristicCommitSuggestion(
  parsed: ParsedDiff,
  findings: SecretFinding[] = [],
): CommitSuggestion {
  const type = inferType(parsed);
  const scope = scopeFor(parsed);
  const subject = pickSubject(parsed, type);
  const body = parsed.files
    .slice(0, 4)
    .map((file) => `${file.path} (${file.additions}+ / ${file.deletions}-)`);
  const confidence = findings.some((item) => item.severity === "critical") ? 0.76 : 0.88;
  const suggestion: CommitSuggestion = {
    type,
    scope,
    subject,
    body,
    confidence,
    engine: "offline-heuristic",
    message: "",
  };
  suggestion.message = formatCommitMessage(suggestion);
  return suggestion;
}

/** Deterministic local review: security findings dominate the score. */
export function heuristicReview(parsed: ParsedDiff, findings: SecretFinding[]): ReviewResult {
  const weights = { critical: 18, high: 10, medium: 4, low: 2 };
  let score = 100;
  for (const finding of findings) score -= weights[finding.severity];

  const added = addedLines(parsed).map((entry) => entry.content);
  const consoleCalls = added.filter((line) => /console\.(log|debug|info)\s*\(/.test(line)).length;
  score -= Math.min(8, consoleCalls * 4);
  if (parsed.totalAdditions > 400) score -= 8;
  score = clamp(score, 5, 100);

  const critical = findings.filter((item) => item.severity === "critical").length;
  const high = findings.filter((item) => item.severity === "high").length;
  const summary = findings.length
    ? `${parsed.files.length} files changed; ${critical} critical and ${high} high security findings need attention before sharing.`
    : `${parsed.files.length} files changed with no secrets detected by the local scanner.`;

  const suggestions: string[] = [];
  for (const finding of findings.slice(0, 3)) {
    suggestions.push(
      `${finding.rule} at ${finding.file}:${finding.line} — ${finding.recommendation}`,
    );
  }
  if (consoleCalls)
    suggestions.push(
      `Replace ${consoleCalls} console call(s) with a structured logger before shipping.`,
    );
  const hasTests = parsed.files.some((file) => /\.(test|spec)\.[^.]+$|tests?\//i.test(file.path));
  if (!hasTests && parsed.totalAdditions > 15)
    suggestions.push("Add a focused test for the new behaviour introduced by this diff.");
  if (parsed.totalAdditions > 400)
    suggestions.push("Split this change into smaller commits to make review practical.");
  if (!suggestions.length)
    suggestions.push("No blocking issues found; run the full test suite before pushing.");

  return {
    score,
    summary,
    findings,
    suggestions: suggestions.slice(0, 5),
    engine: "offline-heuristic",
    filesChanged: parsed.files.length,
    additions: parsed.totalAdditions,
    deletions: parsed.totalDeletions,
  };
}

/** Deterministic local PR draft with a Mermaid impact summary. */
export function heuristicPrDraft(
  parsed: ParsedDiff,
  commits: string[],
  findings: SecretFinding[],
): PrDraft {
  const commit = heuristicCommitSuggestion(parsed, findings);
  const testFiles = parsed.files.filter((file) =>
    /\.(test|spec)\.[^.]+$|tests?\//i.test(file.path),
  );
  const changes = parsed.files.map(
    (file) =>
      `${file.path} — ${file.additions} addition${file.additions === 1 ? "" : "s"}, ${file.deletions} deletion${file.deletions === 1 ? "" : "s"}`,
  );
  const risks = findings
    .slice(0, 3)
    .map((finding) => `${finding.severity.toUpperCase()}: ${finding.recommendation}`);
  if (parsed.totalAdditions > 400)
    risks.push("Large diff: consider splitting into smaller pull requests.");
  if (!risks.length) risks.push("No secret-scanning blockers detected in the changed lines.");

  return {
    title: `${commit.type}${commit.scope ? `(${commit.scope})` : ""}: ${commit.subject}`.slice(
      0,
      72,
    ),
    summary: `This change touches ${parsed.files.length} file${parsed.files.length === 1 ? "" : "s"} with ${parsed.totalAdditions} additions and ${parsed.totalDeletions} deletions. ${commits.length ? `It builds on ${commits.length} recent commit${commits.length === 1 ? "" : "s"}. ` : ""}${findings.length ? `The local secret guard flagged ${findings.length} finding${findings.length === 1 ? "" : "s"} that should be resolved before merge.` : "No secrets were detected in the changed lines."}`,
    changes: changes.length
      ? changes
      : ["No diff was available; review the linked commits for context."],
    testing: [
      ...(testFiles.length
        ? [
            `${testFiles.length} test file${testFiles.length === 1 ? "" : "s"} changed in this diff.`,
          ]
        : []),
      "Run `npm test` (or the project equivalent) and confirm the suite is green.",
      "Run `gitwhisper review` locally before requesting review.",
    ],
    risks,
    mermaid:
      "flowchart LR; A[Staged diff] --> B[Secret guard]; B --> C[LLM insight]; C --> D[Pull request]",
    engine: "offline-heuristic",
  };
}

function offlineOrUnavailable(engine: string, reason?: string): string {
  return reason ? `${engine} (LLM fallback: ${reason})` : engine;
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 90);
}

function normalizeCommit(
  value: Partial<CommitSuggestion>,
  fallback: CommitSuggestion,
  engine: string,
): CommitSuggestion {
  const type = VALID_TYPES.includes(value.type as CommitType)
    ? (value.type as CommitType)
    : fallback.type;
  const suggestion: CommitSuggestion = {
    type,
    scope: asString(value.scope, fallback.scope)
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase(),
    subject: cleanSubject(asString(value.subject, fallback.subject)),
    body: asStringArray(value.body, fallback.body),
    confidence: clamp(
      typeof value.confidence === "number" ? value.confidence : fallback.confidence,
      0,
      1,
    ),
    engine,
    message: "",
  };
  suggestion.message = formatCommitMessage(suggestion);
  return suggestion;
}

/** Try the configured model, but always return a usable local suggestion. */
export async function suggestCommit(
  config: AppConfig,
  parsed: ParsedDiff,
  findings: SecretFinding[],
  forceOffline = false,
): Promise<CommitSuggestion> {
  const fallback = heuristicCommitSuggestion(parsed, findings);
  if (forceOffline || config.offline) return fallback;
  const llm = createProvider(config);
  if (llm.name === "offline") return fallback;
  try {
    const { data, engine } = await generateStructured<Partial<CommitSuggestion>>(
      llm,
      COMMIT_SYSTEM,
      commitUserPrompt(parsed.raw),
    );
    return normalizeCommit(data, fallback, engine);
  } catch (error) {
    return { ...fallback, engine: offlineOrUnavailable(fallback.engine, shortError(error)) };
  }
}

/** Review with local security findings as the source of truth. */
export async function reviewChanges(
  config: AppConfig,
  parsed: ParsedDiff,
  findings: SecretFinding[],
  forceOffline = false,
): Promise<ReviewResult> {
  const fallback = heuristicReview(parsed, findings);
  if (forceOffline || config.offline) return fallback;
  const llm = createProvider(config);
  if (llm.name === "offline") return fallback;
  try {
    const { data, engine } = await generateStructured<{
      score?: number;
      summary?: string;
      suggestions?: string[];
    }>(llm, REVIEW_SYSTEM, reviewUserPrompt(findings, parsed.raw));
    const modelScore =
      typeof data.score === "number" ? clamp(Math.round(data.score), 0, 100) : fallback.score;
    return {
      ...fallback,
      score: Math.min(modelScore, fallback.score),
      summary: asString(data.summary, fallback.summary),
      suggestions: asStringArray(data.suggestions, fallback.suggestions),
      engine,
    };
  } catch (error) {
    return { ...fallback, engine: offlineOrUnavailable(fallback.engine, shortError(error)) };
  }
}

/** Generate a PR draft with a factual Mermaid diagram and safe fallback. */
export async function draftPullRequest(
  config: AppConfig,
  parsed: ParsedDiff,
  commits: string[],
  findings: SecretFinding[],
  forceOffline = false,
): Promise<PrDraft> {
  const fallback = heuristicPrDraft(parsed, commits, findings);
  if (forceOffline || config.offline) return fallback;
  const llm = createProvider(config);
  if (llm.name === "offline") return fallback;
  try {
    const { data, engine } = await generateStructured<Partial<PrDraft>>(
      llm,
      PR_SYSTEM,
      prUserPrompt(commits.join("\n"), parsed.raw, findings),
    );
    const mermaid = asString(data.mermaid, fallback.mermaid).replace(/\r?\n/g, " ").trim();
    return {
      title: asString(data.title, fallback.title).slice(0, 72),
      summary: asString(data.summary, fallback.summary),
      changes: asStringArray(data.changes, fallback.changes),
      testing: asStringArray(data.testing, fallback.testing),
      risks: asStringArray(data.risks, fallback.risks),
      mermaid: /^flowchart\s/.test(mermaid) ? mermaid : fallback.mermaid,
      engine,
    };
  } catch (error) {
    return { ...fallback, engine: offlineOrUnavailable(fallback.engine, shortError(error)) };
  }
}

export function formatPrMarkdown(draft: PrDraft): string {
  const list = (items: string[]) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
  return `# ${draft.title}\n\n## Summary\n\n${draft.summary}\n\n## Changes\n\n${list(draft.changes)}\n\n## Testing\n\n${list(draft.testing)}\n\n## Risks\n\n${list(draft.risks)}\n\n## Impact\n\n\`\`\`mermaid\n${draft.mermaid}\n\`\`\`\n\n---\n\n_Generated by GitWhisper · engine: ${draft.engine}_\n`;
}
