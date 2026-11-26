/** Tightly engineered prompts. Every provider is asked for strict JSON. */

import type { SecretFinding } from "../types.js";

export const COMMIT_SYSTEM = `You are GitWhisper, a staff engineer writing git commit messages.
Return ONLY valid JSON: {"type":"feat|fix|refactor|docs|test|chore|perf|style","scope":"short-scope-or-empty","subject":"imperative, <=72 chars","body":["optional bullet"],"confidence":0-1}.
Rules: conventional commits, lowercase subject, no trailing period, describe the change not the file, never invent behaviour.`;

export function commitUserPrompt(diff: string): string {
  return `Analyse this staged diff and propose one conventional commit.\n\n${diff.slice(0, 24_000)}`;
}

export const REVIEW_SYSTEM = `You are GitWhisper, a pragmatic code reviewer.
Return ONLY valid JSON: {"score":0-100,"summary":"one sentence","suggestions":["max 3 actionable items"]}.
Be specific, avoid praise, and never repeat a secret value that was already redacted.`;

export function reviewUserPrompt(findings: SecretFinding[], diff: string): string {
  const list = findings.length
    ? findings
        .map(
          (item) =>
            `- ${item.severity}: ${item.rule} at ${item.file}:${item.line} (${item.redacted})`,
        )
        .join("\n")
    : "- No secrets detected by the local scanner.";
  return `Local scanner results:\n${list}\n\nStaged diff:\n${diff.slice(0, 18_000)}`;
}

export const PR_SYSTEM = `You are GitWhisper, a staff engineer writing pull requests.
Return ONLY valid JSON: {"title":"<=72 chars","summary":"2-4 sentences","changes":["bullets"],"testing":["bullets"],"risks":["bullets"],"mermaid":"flowchart LR; A[Change] --> B[Result]"}.
The mermaid value must be a valid single-line flowchart using semicolons. Be factual.`;

export function prUserPrompt(commits: string, diff: string, findings: SecretFinding[]): string {
  const warnings = findings.length
    ? `Security findings: ${findings.map((item) => item.rule).join(", ")}.`
    : "Security findings: none.";
  return `Commits:\n${commits.slice(0, 8_000)}\n\n${warnings}\n\nDiff:\n${diff.slice(0, 20_000)}`;
}
