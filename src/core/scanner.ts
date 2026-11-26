/** Local secret detection: curated regexes plus Shannon entropy analysis. */

import { addedLines } from "./git.js";
import type { ParsedDiff, SecretFinding, Severity } from "./types.js";

interface Rule {
  id: string;
  label: string;
  severity: Severity;
  pattern: RegExp;
  recommendation: string;
}

const RULES: Rule[] = [
  {
    id: "aws-access-key",
    label: "AWS access key ID",
    severity: "critical",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    recommendation: "Revoke the key in IAM and replace it with an environment variable.",
  },
  {
    id: "github-token",
    label: "GitHub token",
    severity: "critical",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    recommendation: "Revoke this token in GitHub settings and use a short-lived Actions token.",
  },
  {
    id: "openai-key",
    label: "OpenAI API key",
    severity: "critical",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    recommendation: "Rotate the key in the OpenAI dashboard and load it from a secret store.",
  },
  {
    id: "anthropic-key",
    label: "Anthropic API key",
    severity: "critical",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    recommendation: "Rotate the key and keep it out of source control.",
  },
  {
    id: "stripe-live-key",
    label: "Stripe live secret key",
    severity: "critical",
    pattern: /\b[sr]k_live_[0-9A-Za-z]{16,}\b/g,
    recommendation: "Roll the live key immediately and check Stripe logs for misuse.",
  },
  {
    id: "google-api-key",
    label: "Google API key",
    severity: "high",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    recommendation: "Restrict the key by API and referrer, then rotate it.",
  },
  {
    id: "slack-token",
    label: "Slack token",
    severity: "high",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    recommendation: "Revoke the token in Slack app settings.",
  },
  {
    id: "private-key",
    label: "Private key block",
    severity: "critical",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g,
    recommendation: "Remove the key material and generate a fresh keypair.",
  },
  {
    id: "jwt",
    label: "JSON Web Token",
    severity: "high",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    recommendation: "Do not commit signed tokens; use a short-lived token exchange.",
  },
];

const GENERIC =
  /\b(api[_-]?key|secret|token|password|passwd|pwd|authorization)\s*[:=]\s*["'`]([^"'`\n]{8,120})["'`]/gi;
const QUOTED = /["'`]([A-Za-z0-9+/=_-]{24,120})["'`]/g;
const PLACEHOLDERS =
  /your[_-]?|example|placeholder|changeme|dummy|sample|xxx+|<[^>]+>|\$\{|process\.env|os\.environ|import\.meta\.env|redact|test[_-]?key/i;
const ENTROPY_THRESHOLD = 4.3;

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** Shannon entropy in bits per character; random secrets score above ~4.0. */
export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/** Show only the edges of a secret so logs and reports stay safe. */
export function redact(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.min(8, value.length - 8))}${value.slice(-4)}`;
}

function finding(
  rule: string,
  severity: Severity,
  file: string,
  line: number,
  value: string,
  recommendation: string,
): SecretFinding {
  return { rule, severity, file, line, redacted: redact(value), recommendation };
}

/** Scan a single block of text for credentials and high-entropy literals. */
export function scanText(text: string, file = "unknown", line = 1): SecretFinding[] {
  const results: SecretFinding[] = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const value = match[0];
      if (PLACEHOLDERS.test(value)) continue;
      results.push(finding(rule.id, rule.severity, file, line, value, rule.recommendation));
    }
  }

  GENERIC.lastIndex = 0;
  for (const match of text.matchAll(GENERIC)) {
    const value = match[2] ?? "";
    if (!value || PLACEHOLDERS.test(value)) continue;
    const severity: Severity = /^(api[_-]?key|secret|token|password|authorization)$/i.test(
      match[1] ?? "",
    )
      ? "high"
      : "medium";
    results.push(
      finding(
        "generic-credential",
        severity,
        file,
        line,
        value,
        "Move this value to an environment variable and rotate it.",
      ),
    );
  }

  QUOTED.lastIndex = 0;
  for (const match of text.matchAll(QUOTED)) {
    const value = match[1] ?? "";
    if (PLACEHOLDERS.test(value) || shannonEntropy(value) < ENTROPY_THRESHOLD) continue;
    results.push(
      finding(
        "high-entropy-literal",
        "medium",
        file,
        line,
        value,
        "Confirm this literal is not a credential; use a secret manager if it is.",
      ),
    );
  }

  const seen = new Set<string>();
  return results
    .filter((item) => {
      const key = `${item.rule}|${item.file}|${item.line}|${item.redacted}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.line - b.line);
}

/** Scan only the added lines of a staged diff. */
export function scanDiff(diff: ParsedDiff): SecretFinding[] {
  return addedLines(diff).flatMap((entry) => scanText(entry.content, entry.file, entry.line));
}

/** Count findings by severity for dashboards and CI summaries. */
export function countBySeverity(findings: SecretFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return counts;
}
