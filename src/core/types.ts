/** Shared domain types for GitWhisper. */

export type Severity = "critical" | "high" | "medium" | "low";

export type CommitType = "feat" | "fix" | "refactor" | "docs" | "test" | "chore" | "perf" | "style";

export interface SecretFinding {
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  redacted: string;
  recommendation: string;
}

export interface DiffLine {
  kind: "add" | "del" | "context";
  content: string;
  lineNumber: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  raw: string;
  truncated: boolean;
}

export interface CommitSuggestion {
  type: CommitType;
  scope: string;
  subject: string;
  body: string[];
  confidence: number;
  engine: string;
  message: string;
}

export interface ReviewResult {
  score: number;
  summary: string;
  findings: SecretFinding[];
  suggestions: string[];
  engine: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface PrDraft {
  title: string;
  summary: string;
  changes: string[];
  testing: string[];
  risks: string[];
  mermaid: string;
  engine: string;
}

export interface RepoCommit {
  hash: string;
  message: string;
  date: string;
  author: string;
}

export interface RepoSummary {
  repository: string;
  branch: string;
  generatedAt: string;
  commits: RepoCommit[];
  velocity: Array<{ date: string; count: number }>;
  commitTypes: Array<{ label: string; value: number }>;
  topFiles: Array<{ path: string; changes: number }>;
  secretFindings: number;
  healthScore: number;
}
